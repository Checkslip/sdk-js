import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type {
  ApiRequestRecord,
  AuditEvent,
  SlipCheck,
  SlipCheckedEvent,
  SlipCheckRecord,
} from "../src/index.js";

// Fields leaving the customer API. The SDK must not expose them.
const REMOVED = [
  "upstream_ms",
  "recorded_by",
  "chain",
  "trace_id",
  "checked_elsewhere",
  "latency_ms",
  "build",
  "source_domain",
];

describe("generated types", () => {
  it("contain none of the removed fields as properties", () => {
    const source = readFileSync(new URL("../src/generated/openapi.ts", import.meta.url), "utf8");
    for (const field of REMOVED) {
      expect(source).not.toMatch(new RegExp(`^\\s+"?${field}"?\\??:`, "m"));
    }
  });

  it("reject removed fields at compile time", () => {
    // Each line below fails `tsc --noEmit` if the field comes back into the types.
    const check = {} as SlipCheck;
    const record = {} as SlipCheckRecord;
    const request = {} as ApiRequestRecord;
    const audit = {} as AuditEvent;
    const event = { data: {} } as SlipCheckedEvent;
    // @ts-expect-error removed from the customer API
    void check.latency_ms;
    // @ts-expect-error removed from the customer API
    void check.upstream_ms;
    // @ts-expect-error removed from the customer API
    void check.checked_elsewhere;
    // @ts-expect-error removed from the customer API
    void record.checked_elsewhere;
    // @ts-expect-error removed from the customer API
    void request.trace_id;
    // @ts-expect-error removed from the customer API
    void request.recorded_by;
    // @ts-expect-error removed from the customer API
    void request.chain;
    // @ts-expect-error removed from the customer API
    void request.build;
    // @ts-expect-error removed from the customer API
    void audit.source_domain;
    // @ts-expect-error removed from the customer API
    void event.data.checked_elsewhere;
    expect(true).toBe(true);
  });
});
