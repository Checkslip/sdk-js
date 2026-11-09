import { describe, expect, it } from "bun:test";
import { Checkslip } from "../src/index.js";
import type { ApiRequestRecord, AuditEvent, FreeReason, UsageCounts } from "../src/types.js";
import { client, FOUND, json, QR, TEST_KEY } from "./helpers.js";

/**
 * These tests guard the surface the four Checkslip SDKs share.
 * They are not about JavaScript behaviour: they exist so the four SDKs cannot
 * drift apart again, which is what happened in the first drafts.
 */

/** Fields that left the customer API. They must never come back into the types. */
const WITHDRAWN_FIELDS = [
  "trace_id",
  "recorded_by",
  "chain",
  "build",
  "source_domain",
  "redactions",
  "causation_id",
] as const;

describe("tolerating fields the SDK does not model", () => {
  // The published OpenAPI document decides what the SDK exposes.
  // A response may still carry something the SDK does not model, so parsing
  // must not depend on the exact set of fields.
  const withExtras = {
    ...FOUND,
    trace_id: "0af7651916cd43dd8448eb211c80319c",
    recorded_by: "gw-1",
    chain: {},
    build: "2026.11.9",
  };

  it("parses a payload carrying fields the SDK does not model", async () => {
    const { checkslip } = client([json(withExtras)]);
    const check = await checkslip.slips.lookup({ qr: QR });
    expect(check.request_id).toBe(FOUND.request_id);
    expect(check.outcome).toBe("FOUND");
  });

  it("parses the same payload without them", async () => {
    const { checkslip } = client([json(FOUND)]);
    const check = await checkslip.slips.lookup({ qr: QR });
    expect(check.request_id).toBe(FOUND.request_id);
  });

  it("gives the same documented result either way", async () => {
    const a = await client([json(withExtras)]).checkslip.slips.lookup({ qr: QR });
    const b = await client([json(FOUND)]).checkslip.slips.lookup({ qr: QR });
    for (const key of Object.keys(b) as (keyof typeof b)[]) {
      expect(a[key]).toEqual(b[key]);
    }
    expect(a.slip).toEqual(b.slip);
  });

  it("keeps the withdrawn fields out of the generated types", () => {
    const request = {} as ApiRequestRecord;
    const audit = {} as AuditEvent;
    // @ts-expect-error trace_id left the customer API
    void request.trace_id;
    // @ts-expect-error recorded_by left the customer API
    void request.recorded_by;
    // @ts-expect-error chain left the customer API
    void request.chain;
    // @ts-expect-error redactions left the customer API
    void request.redactions;
    // @ts-expect-error source_domain left the customer API
    void audit.source_domain;
    expect(WITHDRAWN_FIELDS).toHaveLength(7);
  });

  it("does carry latency_ms on a request record, which the contract requires", () => {
    const request = {} as ApiRequestRecord;
    const ms: number = request.latency_ms;
    void ms;
    expect(WITHDRAWN_FIELDS).not.toContain("latency_ms");
  });
});

describe("usage counts, now that free_other exists", () => {
  // The API added free_other, stopped counting free_no_credit and
  // free_hold_expired, and drops those two fields later. The SDK and the API
  // are deployed separately, so both shapes have to work.
  it("types the new count and the two deprecated ones as optional", () => {
    const counts = {} as UsageCounts;
    const other: number | undefined = counts.free_other;
    const noCredit: number | undefined = counts.free_no_credit;
    const holdExpired: number | undefined = counts.free_hold_expired;
    void [other, noCredit, holdExpired];
    const required: number = counts.free_system_error;
    void required;
  });

  it("names OTHER as a free reason", () => {
    const reason: FreeReason = "OTHER";
    expect(reason).toBe("OTHER");
  });

  it("reads a report whether or not the deprecated counts are there", async () => {
    const common = {
      checks: 12,
      charged: 7,
      free_not_found: 1,
      free_duplicate: 0,
      free_unavailable: 0,
      free_invalid_qr: 0,
      free_invalid_file: 0,
      free_qr_tampered: 0,
      free_too_old: 0,
      free_system_error: 0,
    };
    const report = (totals: Record<string, number>) => ({
      interval: "day",
      as_of: "2026-11-09T10:00:00+07:00",
      from: "2026-11-01",
      to: "2026-11-09",
      timezone: "Asia/Bangkok",
      buckets: [{ start: "2026-11-01", ...totals }],
      totals,
    });

    const before = client([json(report({ ...common, free_no_credit: 3, free_hold_expired: 2 }))]);
    const old = await before.checkslip.usage.get({ from: "2026-11-01", to: "2026-11-09" });
    expect(old.totals.free_no_credit).toBe(3);
    expect(old.totals.free_other).toBeUndefined();

    const after = client([json(report({ ...common, free_other: 5 }))]);
    const now = await after.checkslip.usage.get({ from: "2026-11-01", to: "2026-11-09" });
    expect(now.totals.free_other).toBe(5);
    expect(now.totals.free_no_credit).toBeUndefined();
    expect(now.buckets[0]?.free_other).toBe(5);
  });
});

describe("202 is success, not an error", () => {
  it("resolves a lookup that answers 202 PENDING", async () => {
    // The contract requires slip and does not make it nullable, so a pending
    // answer carries the summary form rather than null.
    const pending = {
      ...FOUND,
      outcome: "PENDING",
      slip: { trans_ref: "630210534087", sender_bank: FOUND.slip.sender.bank },
    };
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

  it("unwraps the event types", async () => {
    const { checkslip } = client([json({ items: [{ type: "slip.checked" }] })]);
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

describe("naming parity across the four SDKs", () => {
  // Every canonical resource.method, spelled the JavaScript way. 39 API
  // operations + 9 listAll iterators + the local webhooks.verify = 49.
  // Audit checkpoints, chain checks and signing keys left the customer API on
  // 9 Nov 2026, so they are not here.
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
    "audit.exports.list",
    "audit.exports.listAll",
    "audit.exports.create",
    "audit.exports.get",
    "audit.exports.download",
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

  it("has 49 canonical names, one per table row plus the iterators", () => {
    expect(new Set(CANONICAL).size).toBe(49);
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
