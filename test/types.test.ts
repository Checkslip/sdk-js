import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ApiRequestRecord, AuditEvent, SlipCheck } from "../src/index.js";

// Fields that left the customer API. The public spec is the arbiter
// (checkslip/pm, 9 Nov 2026), so the list is what the contract dropped, not
// what an older brief listed. latency_ms stayed, and is required on
// ApiRequestRecord, so it is deliberately absent here.
const WITHDRAWN = [
  "recorded_by",
  "chain",
  "trace_id",
  "build",
  "source_domain",
  "redactions",
  "causation_id",
];

describe("generated types", () => {
  it("contain none of the withdrawn fields as properties", () => {
    const source = readFileSync(new URL("../src/generated/openapi.ts", import.meta.url), "utf8");
    for (const field of WITHDRAWN) {
      expect(source).not.toMatch(new RegExp(`^\\s+"?${field}"?\\??:`, "m"));
    }
  });

  it("rejects the withdrawn fields at compile time", () => {
    // The public spec decides what a customer sees (checkslip/pm, 9 Nov 2026).
    // These seven left the contract, so each line below fails `tsc --noEmit`
    // if one comes back into the types.
    const request = {} as ApiRequestRecord;
    const audit = {} as AuditEvent;
    // @ts-expect-error trace_id left the customer API
    void request.trace_id;
    // @ts-expect-error recorded_by left the customer API
    void request.recorded_by;
    // @ts-expect-error chain left the customer API
    void request.chain;
    // @ts-expect-error build left the customer API
    void request.build;
    // @ts-expect-error redactions left the customer API
    void request.redactions;
    // @ts-expect-error source_domain left the customer API
    void audit.source_domain;
    // @ts-expect-error causation_id left the customer API
    void audit.causation_id;
    expect(true).toBe(true);
  });

  it("keeps the fields the contract still documents", () => {
    // latency_ms is required on ApiRequestRecord in the contract, so the SDK
    // carries it. Reading these must type-check.
    const request = {} as ApiRequestRecord;
    const check = {} as SlipCheck;
    const ms: number = request.latency_ms;
    void ms;
    void check.latency_ms;
    void check.upstream_ms;
    void check.checked_elsewhere;
    expect(true).toBe(true);
  });
});
