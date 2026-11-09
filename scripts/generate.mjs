// Generates src/generated/openapi.ts from spec/openapi.json.
//
// Before generating, it removes response fields that are leaving the customer
// API (see REMOVED_FIELDS) so the SDK never exposes them in its types.
//
// Usage:
//   node scripts/generate.mjs          write the file
//   node scripts/generate.mjs --check  exit 1 if the committed file is out of date
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";

/**
 * Query arrays the API reads as one comma-separated value (style form,
 * explode false). Every other array is sent as repeated keys.
 */
function commaSeparatedQueryArrays(source) {
  const map = {};
  for (const item of Object.values(source.paths)) {
    for (const op of Object.values(item)) {
      if (!op || typeof op !== "object" || !op.operationId) continue;
      for (const p of op.parameters ?? []) {
        if (p.in === "query" && p.schema?.type === "array" && p.explode === false) {
          map[op.operationId] ??= [];
          map[op.operationId].push(p.name);
        }
      }
    }
  }
  return map;
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const specPath = join(root, "spec/openapi.json");
const outPath = join(root, "src/generated/openapi.ts");
const queryOutPath = join(root, "src/generated/query-style.ts");

/**
 * Fields that left the Checkslip API. The published OpenAPI document is the
 * arbiter, so generation does not strip anything: it only checks that these
 * have not come back. If one reappears, that is a question about the API, not
 * something to hide quietly, so generation stops.
 */
const WITHDRAWN_FIELDS = new Set([
  "trace_id",
  "recorded_by",
  "chain",
  "build",
  "source_domain",
  "redactions",
  "causation_id",
]);

/**
 * These three are being withdrawn from the Checkslip API. Until the published
 * document stops listing them, the SDK removes them here, so a caller never
 * builds on a field that is about to disappear. Delete this block, the call
 * below and the matching test once the document no longer lists them.
 */
const PENDING_REMOVAL = {
  schemas: {
    SlipCheck: ["latency_ms", "upstream_ms", "checked_elsewhere"],
    SlipCheckRecord: ["latency_ms", "upstream_ms", "checked_elsewhere"],
    // The spec already marks this one deprecated, and the Go and PHP clients
    // do not carry it either.
    SlipCheckedData: ["checked_elsewhere"],
  },
  enums: { ExportColumn: ["latency_ms", "upstream_ms", "checked_elsewhere"] },
};

/**
 * The API has these already and the published document has not caught up.
 * Until it does, the SDK adds them here, so callers can write code for the
 * shape the API actually serves. Generation stops once the document lists
 * them, so this block and the matching test get deleted instead of rotting.
 *
 * free_no_credit and free_hold_expired stay in the types but stop being
 * required. The API no longer counts them and drops both fields later, so
 * code that reads them has to handle them being absent.
 */
const PENDING_ADDITION = {
  schemas: {
    UsageCounts: {
      add: {
        free_other: {
          type: "integer",
          minimum: 0,
          description: "Lookups that were not charged with no reason given.",
        },
      },
      optional: ["free_no_credit", "free_hold_expired"],
    },
  },
  enums: { FreeReason: ["OTHER"] },
};

function applyPendingAddition(doc) {
  for (const [name, { add, optional }] of Object.entries(PENDING_ADDITION.schemas)) {
    const schema = doc.components?.schemas?.[name];
    if (!schema?.properties) throw new Error(`PENDING_ADDITION names ${name}, which the spec does not have`);
    for (const [field, definition] of Object.entries(add ?? {})) {
      if (schema.properties[field])
        throw new Error(`the spec now has ${name}.${field}: take it out of PENDING_ADDITION`);
      schema.properties[field] = definition;
    }
    if (Array.isArray(schema.required) && optional) {
      schema.required = schema.required.filter((r) => !optional.includes(r));
    }
  }
  for (const [name, values] of Object.entries(PENDING_ADDITION.enums)) {
    const schema = doc.components?.schemas?.[name];
    if (!Array.isArray(schema?.enum))
      throw new Error(`PENDING_ADDITION names the enum ${name}, which the spec does not have`);
    for (const value of values) {
      if (schema.enum.includes(value))
        throw new Error(`the spec now lists ${name} ${value}: take it out of PENDING_ADDITION`);
      schema.enum.push(value);
    }
  }
}

function applyPendingRemoval(doc) {
  // The lookup description ends with a paragraph about checked_elsewhere.
  // Hiding the field while documenting it would only confuse a reader.
  const lookup = doc.paths?.["/api/slips/lookup"]?.post;
  if (typeof lookup?.description === "string") {
    const cut = lookup.description.indexOf(" The checked_elsewhere field");
    if (cut !== -1) lookup.description = lookup.description.slice(0, cut);
  }

  for (const [name, fields] of Object.entries(PENDING_REMOVAL.schemas)) {
    const schema = doc.components?.schemas?.[name];
    if (!schema?.properties) throw new Error(`PENDING_REMOVAL names ${name}, which the spec no longer has`);
    for (const field of fields) {
      delete schema.properties[field];
      if (Array.isArray(schema.required)) {
        schema.required = schema.required.filter((r) => r !== field);
      }
    }
  }
  for (const [name, values] of Object.entries(PENDING_REMOVAL.enums)) {
    const schema = doc.components?.schemas?.[name];
    if (!Array.isArray(schema?.enum))
      throw new Error(`PENDING_REMOVAL names the enum ${name}, which the spec no longer has`);
    schema.enum = schema.enum.filter((v) => !values.includes(v));
  }
}

const spec = JSON.parse(readFileSync(specPath, "utf8"));

const reappeared = [];
function auditSpec(node, path) {
  if (Array.isArray(node)) {
    for (const [i, item] of node.entries()) {
      auditSpec(item, `${path}[${i}]`);
    }
    return;
  }
  if (node === null || typeof node !== "object") return;
  if (node.properties && typeof node.properties === "object") {
    for (const field of Object.keys(node.properties)) {
      if (WITHDRAWN_FIELDS.has(field)) reappeared.push(`${path}.properties.${field}`);
    }
  }
  if (Array.isArray(node.parameters)) {
    for (const prm of node.parameters) {
      if (prm && WITHDRAWN_FIELDS.has(prm.name)) reappeared.push(`${path}.parameters.${prm.name}`);
    }
  }
  for (const [key, value] of Object.entries(node)) auditSpec(value, `${path}.${key}`);
}
applyPendingRemoval(spec);
applyPendingAddition(spec);
auditSpec(spec, "$");
if (reappeared.length > 0) {
  throw new Error(`fields that left the customer API are back in the spec: ${reappeared.join(", ")}`);
}

// defaultNonNullable: false keeps fields with a default optional (they are optional in requests).
const ast = await openapiTS(spec, { alphabetize: true, defaultNonNullable: false });
const header = [
  "/**",
  " * This file is generated by scripts/generate.mjs from spec/openapi.json.",
  " * Do not edit it by hand. Run `npm run generate` after updating the spec.",
  " */",
  "",
].join("\n");
const outputs = [
  [outPath, `${header}${astToString(ast)}`],
  [
    queryOutPath,
    `${header}\n/** Query arrays sent as one comma-separated value, by operationId. */\nexport const commaSeparatedQuery: Readonly<Record<string, readonly string[]>> = ${JSON.stringify(commaSeparatedQueryArrays(spec), null, 2)};\n`,
  ],
];

if (process.argv.includes("--check")) {
  let stale = false;
  for (const [path, output] of outputs) {
    let current = "";
    try {
      current = readFileSync(path, "utf8");
    } catch {}
    if (current !== output) {
      console.error(`${path} is out of date. Run \`npm run generate\`.`);
      stale = true;
    }
  }
  if (stale) process.exit(1);
  console.log("generated files are up to date.");
} else {
  for (const [path, output] of outputs) {
    writeFileSync(path, output);
    console.log(`wrote ${path}`);
  }
}
