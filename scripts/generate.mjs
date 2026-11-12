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
 * Fields that have to keep a raw-string escape in their type.
 *
 * All four SDKs promise that a value the API adds later still parses and
 * reaches the caller as its raw string: Rust has Unknown(String), Go types
 * these as string, PHP returns the string, and here the union carries
 * `| string`. A closed enum would generate types that contradict that
 * promise, and a caller whose code compiles today would stop matching what
 * the API actually sends on the day a reason is added.
 *
 * This fired for real on 11 Nov 2026: SlipCheckRecord.free_reason was
 * narrowed to oneOf[CustomerFreeReason, null] by accident (verify 5a7be823,
 * reopened on pm's order), which a refresh would have pulled in silently.
 *
 * Only response fields belong here. A request filter may be closed on
 * purpose, because a caller can only send a value that exists today
 * (metering, who owns the vocabulary, 11 Nov 2026). Adding a filter to this
 * list would block a narrowing the API is entitled to make.
 */
const MUST_STAY_OPEN = {
  // reason was added 12 Nov 2026, after ACCOUNT_RESTORED showed that the API
  // does grow this set. billing's contract had called CreditReason an open set
  // all along while declaring it closed, so a caller could not name the value
  // the API was already sending.
  CreditEntry: ["free_reason", "reason"],
  SlipCheckRecord: ["free_reason"],
  // Added 12 Nov 2026 with webhook 0.7.0, which introduced STAFF. The field
  // had been a closed enum, so the generated union could not express a reason
  // added later and a caller had no value to match on until the next release.
  // The document now declares it the way free_reason is declared.
  Endpoint: ["disabled_reason"],
};

/** True when the schema accepts a plain string somewhere in its shape. */
function allowsRawString(schema, doc, depth = 0) {
  if (!schema || typeof schema !== "object" || depth > 6) return false;
  if (schema.$ref) {
    const name = schema.$ref.split("/").pop();
    return allowsRawString(doc.components?.schemas?.[name], doc, depth + 1);
  }
  const type = schema.type;
  if (type === "string" && !Array.isArray(schema.enum)) return true;
  if (Array.isArray(type) && type.includes("string") && !Array.isArray(schema.enum)) return true;
  for (const key of ["anyOf", "oneOf", "allOf"]) {
    const branches = schema[key];
    if (Array.isArray(branches) && branches.some((b) => allowsRawString(b, doc, depth + 1))) return true;
  }
  return false;
}

/** Properties of a schema, looking through an allOf composition. */
function propertiesOf(schema, doc, depth = 0) {
  if (!schema || typeof schema !== "object" || depth > 6) return {};
  if (schema.$ref) {
    const name = schema.$ref.split("/").pop();
    return propertiesOf(doc.components?.schemas?.[name], doc, depth + 1);
  }
  let out = { ...(schema.properties ?? {}) };
  for (const branch of schema.allOf ?? []) out = { ...out, ...propertiesOf(branch, doc, depth + 1) };
  return out;
}

function auditOpenFields(doc) {
  for (const [name, fields] of Object.entries(MUST_STAY_OPEN)) {
    const schema = doc.components?.schemas?.[name];
    if (!schema) throw new Error(`MUST_STAY_OPEN names ${name}, which the spec no longer has`);
    const props = propertiesOf(schema, doc);
    for (const field of fields) {
      if (!props[field])
        throw new Error(`MUST_STAY_OPEN names ${name}.${field}, which the spec no longer has`);
      if (!allowsRawString(props[field], doc))
        throw new Error(
          `${name}.${field} no longer accepts a raw string: the SDKs promise an unknown value still reaches the caller, ` +
            `so generating this as a closed enum would contradict their own docs. Ask whether the narrowing was intended.`,
        );
    }
  }
}

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
auditOpenFields(spec);
applyPendingRemoval(spec);
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
