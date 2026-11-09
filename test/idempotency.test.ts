import { describe, expect, it } from "vitest";
import { client, FOUND, json, QR, UUID_RE } from "./helpers.js";

describe("idempotency", () => {
  it("generates a UUID Idempotency-Key for lookup when none is given", async () => {
    const { checkslip, calls } = client([json(FOUND), json(FOUND)]);
    await checkslip.slips.lookup({ qr: QR });
    await checkslip.slips.lookup({ qr: QR });
    const first = calls[0]!.headers.get("idempotency-key") ?? "";
    const second = calls[1]!.headers.get("idempotency-key") ?? "";
    expect(first).toMatch(UUID_RE);
    expect(second).toMatch(UUID_RE);
    expect(first).not.toBe(second);
  });

  it("uses the caller's Idempotency-Key", async () => {
    const { checkslip, calls } = client([json(FOUND)]);
    await checkslip.slips.lookup({ qr: QR }, { idempotencyKey: "order-1042-slip-1" });
    expect(calls[0]!.headers.get("idempotency-key")).toBe("order-1042-slip-1");
  });

  it("sends a key on every endpoint whose spec requires one", async () => {
    const { checkslip, calls } = client([json({}), json({}), json({}), json({}), json({})]);
    await checkslip.webhooks.endpoints.rotateSecret("ep_1");
    await checkslip.webhooks.endpoints.sendTest("ep_1");
    await checkslip.webhooks.endpoints.recover("ep_1", { since: "2026-11-01T00:00:00Z" });
    await checkslip.webhooks.deliveries.redeliver("dl_1");
    await checkslip.audit.exports.create({ from_day: "2026-11-01", to_day: "2026-11-02" });
    for (const call of calls) expect(call.headers.get("idempotency-key")).toMatch(UUID_RE);
  });

  it("sends no key where the spec has none", async () => {
    const { checkslip, calls } = client([json({}), json({})]);
    await checkslip.slips.exports.create({ columns: ["request_id", "outcome"] });
    await checkslip.billing.balance();
    for (const call of calls) expect(call.headers.has("idempotency-key")).toBe(false);
  });
});
