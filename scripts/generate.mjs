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
  "upstream_ms",
]);

// Two of the fields withdrawn with upstream_ms cannot be audited by name:
// APIRequestRecord.latency_ms is contractual and stays, and the webhook
// payload still declares checked_elsewhere (see PENDING_REMOVAL). Listing
// either here would stop generation on a field the API is entitled to send.

/**
 * The published document has dropped latency_ms, upstream_ms and
 * checked_elsewhere from the lookup types and from the export columns, so
 * nothing is hidden there any more.
 *
 * What is left is the webhook payload, which still declares
 * checked_elsewhere. The Go, PHP and Rust clients do not carry it either, so
 * the four stay in step. Delete this block and the matching test once the
 * document drops it from SlipCheckedData too.
 */
const PENDING_REMOVAL = {
  schemas: {
    SlipCheckedData: ["checked_elsewhere"],
  },
  enums: {},
};

/**
 * free_other and OTHER now come from the published document, so the SDK no
 * longer adds them.
 *
 * free_no_credit and free_hold_expired are a different matter: the document
 * still lists both as required, marked deprecated with maximum 0, and drops
 * them in a later release. Generating them as required would promise a
 * reader two fields that are about to disappear, so they stay optional here.
 * Delete this block once the document stops listing them.
 */
const PENDING_ADDITION = {
  schemas: {
    UsageCounts: {
      optional: ["free_no_credit", "free_hold_expired"],
    },
  },
  enums: {},
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
    // Stop once the document drops one of these, so the block gets deleted
    // rather than sitting here doing nothing: the forcing below would quietly
    // no-op and the temporary block would rot in place.
    for (const field of optional ?? []) {
      if (!schema.properties[field])
        throw new Error(`the spec has dropped ${name}.${field}: take it out of PENDING_ADDITION`);
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
