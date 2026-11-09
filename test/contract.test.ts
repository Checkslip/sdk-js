import { describe, expect, it } from "vitest";
import { Checkslip } from "../src/index.js";
import type { ApiRequestRecord, AuditEvent, ExportColumn, SlipCheck } from "../src/types.js";
import { client, FOUND, json, QR, TEST_KEY } from "./helpers.js";

/**
 * These tests guard the cross-language SDK contract in docs/sdk-naming.md.
 * They are not about JavaScript behaviour: they exist so the four SDKs cannot
 * drift apart again, which is what happened in the first drafts.
 */

/** Fields the API is removing. They must never appear in SDK types. */
const HIDDEN_FIELDS = [
  "latency_ms",
  "upstream_ms",
  "checked_elsewhere",
  "trace_id",
  "recorded_by",
  "build",
  "chain",
  "source_domain",
] as const;

describe("tolerate but hide", () => {
  // The same lookup, once as the API answers today and once as it will answer
  // after the fields are removed.
  const withHidden = {
    ...FOUND,
    latency_ms: 812,
    upstream_ms: 640,
    checked_elsewhere: false,
  };
  const withoutHidden = FOUND;

  it("parses a payload that still carries the hidden fields", async () => {
    const { checkslip } = client([json(withHidden)]);
    const check = await checkslip.slips.lookup({ qr: QR });
    expect(check.request_id).toBe(FOUND.request_id);
    expect(check.outcome).toBe("FOUND");
  });

  it("parses a payload with the hidden fields already gone", async () => {
    const { checkslip } = client([json(withoutHidden)]);
    const check = await checkslip.slips.lookup({ qr: QR });
    expect(check.request_id).toBe(FOUND.request_id);
    expect(check.outcome).toBe("FOUND");
  });

  it("gives the same documented result either way", async () => {
    const a = await client([json(withHidden)]).checkslip.slips.lookup({ qr: QR });
    const b = await client([json(withoutHidden)]).checkslip.slips.lookup({ qr: QR });
    // Compare only what the SDK documents: every field it declares.
    for (const key of Object.keys(b) as (keyof typeof b)[]) {
      expect(a[key]).toEqual(b[key]);
    }
    expect(a.slip).toEqual(b.slip);
  });

  it("keeps the hidden fields out of the generated types", () => {
    // Compile-time half of the rule. Each @ts-expect-error fails the build if
    // the field ever becomes typed again, so this test cannot rot quietly.
    // @ts-expect-error latency_ms is hidden from customers
    type _Latency = SlipCheck["latency_ms"];
    // @ts-expect-error upstream_ms is hidden from customers
    type _Upstream = SlipCheck["upstream_ms"];
    // @ts-expect-error checked_elsewhere is hidden from customers
    type _Elsewhere = SlipCheck["checked_elsewhere"];
    // @ts-expect-error trace_id is hidden from customers
    type _Trace = ApiRequestRecord["trace_id"];
    // @ts-expect-error recorded_by is hidden from customers
    type _RecordedBy = ApiRequestRecord["recorded_by"];
    // @ts-expect-error build is hidden from customers
    type _Build = ApiRequestRecord["build"];
    // @ts-expect-error source_domain is hidden from customers
    type _SourceDomain = AuditEvent["source_domain"];
    expect(HIDDEN_FIELDS).toHaveLength(8);
  });

  it("does not offer the hidden fields as export columns", () => {
    const allowed: ExportColumn = "slip.trans_ref";
    // @ts-expect-error latency_ms was dropped from ExportColumn
    const hidden: ExportColumn = "latency_ms";
    expect(allowed).toBe("slip.trans_ref");
    expect(hidden).toBe("latency_ms");
  });
});

describe("202 is success, not an error", () => {
  it("resolves a lookup that answers 202 PENDING", async () => {
    const pending = { ...FOUND, outcome: "PENDING", slip: null };
    const { checkslip } = client([json(pending, 202)]);
    const check = await checkslip.slips.lookup({ qr: QR });
    expect(check.outcome).toBe("PENDING");
  });

  it("resolves an export that answers 202", async () => {
    const body = { export_id: "exp_1", state: "RUNNING", created_at: "", request: { columns: [] } };
    const { checkslip } = client([json(body, 202)]);
    await expect(checkslip.slips.exports.create({ columns: [] } as never)).resolves.toMatchObject({
      export_id: "exp_1",
    });
  });

  it("returns nothing when deleting an endpoint answers 204", async () => {
    const { checkslip } = client([new Response(null, { status: 204 })]);
    await expect(checkslip.webhooks.endpoints.delete("ep_1")).resolves.toBeUndefined();
  });
});

describe("envelope unwrapping", () => {
  it("unwraps a bare {items} list to the items (banks)", async () => {
    const bank = { code: "KKP", bot_code: "069", name_th: "a", name_en: "b" };
    const { checkslip } = client([json({ items: [bank] })]);
    const banks = await checkslip.banks.list();
    expect(Array.isArray(banks)).toBe(true);
    expect(banks[0]?.code).toBe("KKP");
  });

  it("unwraps the latest checkpoints and the event types", async () => {
    const { checkslip } = client([
      json({ items: [{ day: "2026-11-08" }] }),
      json({ items: [{ type: "slip.checked" }] }),
    ]);
    await expect(checkslip.audit.checkpoints.listLatest()).resolves.toHaveLength(1);
    await expect(checkslip.webhooks.eventTypes.list()).resolves.toHaveLength(1);
  });

  it("keeps the package list whole, because it carries more than items", async () => {
    const body = { items: [{ code: "p1" }], prices_include_vat: true, checkout_open: true };
    const { checkslip } = client([json(body)]);
    const packages = await checkslip.billing.packages.list();
    expect(packages.prices_include_vat).toBe(true);
    expect(packages.checkout_open).toBe(true);
    expect(packages.items).toHaveLength(1);
  });

  it("keeps next_cursor on a page", async () => {
    const { checkslip } = client([json({ items: [FOUND], next_cursor: "c2" })]);
    const page = await checkslip.slips.list();
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBe("c2");
    expect(page.hasNextPage()).toBe(true);
  });
});

describe("naming parity with docs/sdk-naming.md", () => {
  // Every canonical resource.method, spelled the JavaScript way. 43 API
  // operations + 10 listAll iterators + the local webhooks.verify = 54.
  const CANONICAL = [
    "slips.lookup",
    "slips.get",
    "slips.list",
    "slips.listAll",
    "slips.counts",
    "slips.exports.create",
    "slips.exports.get",
    "slips.exports.downloadPart",
    "banks.list",
    "billing.balance.get",
    "billing.info.get",
    "billing.info.update",
    "billing.packages.list",
    "billing.ledger.list",
    "billing.ledger.listAll",
    "billing.orders.list",
    "billing.orders.listAll",
    "billing.orders.get",
    "billing.orders.sync",
    "billing.receipts.list",
    "billing.receipts.listAll",
    "billing.receipts.get",
    "usage.get",
    "audit.events.list",
    "audit.events.listAll",
    "audit.events.get",
    "audit.requests.list",
    "audit.requests.listAll",
    "audit.requests.get",
    "audit.checkpoints.list",
    "audit.checkpoints.listAll",
    "audit.checkpoints.listLatest",
    "audit.chain.check",
    "audit.exports.list",
    "audit.exports.listAll",
    "audit.exports.create",
    "audit.exports.get",
    "audit.exports.download",
    "audit.signingKeys.get",
    "webhooks.endpoints.list",
    "webhooks.endpoints.listAll",
    "webhooks.endpoints.create",
    "webhooks.endpoints.get",
    "webhooks.endpoints.update",
    "webhooks.endpoints.delete",
    "webhooks.endpoints.recover",
    "webhooks.endpoints.rotateSecret",
    "webhooks.endpoints.sendTest",
    "webhooks.deliveries.list",
    "webhooks.deliveries.listAll",
    "webhooks.deliveries.get",
    "webhooks.deliveries.redeliver",
    "webhooks.eventTypes.list",
    "webhooks.verify",
  ] as const;

  const checkslip = new Checkslip({ apiKey: TEST_KEY, fetch: (() => {}) as never });

  function resolve(path: string): unknown {
    return path
      .split(".")
      .reduce<Record<string, unknown>>(
        (node, key) => node[key] as Record<string, unknown>,
        checkslip as unknown as Record<string, unknown>,
      );
  }

  it("has 54 canonical names, one per table row plus the iterators", () => {
    expect(new Set(CANONICAL).size).toBe(54);
  });

  it.each(CANONICAL)("exposes %s", (path) => {
    expect(typeof resolve(path)).toBe("function");
  });

  it("exposes no methods the table does not list", () => {
    const expected = new Set<string>(CANONICAL);
    const extra: string[] = [];

    const walk = (node: object, prefix: string, depth: number) => {
      if (depth > 3) return;
      for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(node))) {
        if (key === "constructor" || key.startsWith("_")) continue;
        const path = `${prefix}${key}`;
        if (typeof (node as Record<string, unknown>)[key] === "function" && !expected.has(path)) {
          extra.push(path);
        }
      }
      for (const [key, value] of Object.entries(node)) {
        if (value && typeof value === "object" && key !== "http") {
          walk(value, `${prefix}${key}.`, depth + 1);
        }
      }
    };

    for (const group of ["slips", "banks", "billing", "usage", "audit", "webhooks"] as const) {
      walk(checkslip[group], `${group}.`, 1);
    }
    expect(extra).toEqual([]);
  });
});
