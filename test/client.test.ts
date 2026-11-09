import { afterEach, describe, expect, it } from "bun:test";
import { Checkslip, CheckslipError, VERSION } from "../src/index.js";
import { client, FOUND, json, QR, TEST_KEY } from "./helpers.js";

describe("client", () => {
  const savedEnv = process.env.CHECKSLIP_API_KEY;
  afterEach(() => {
    if (savedEnv === undefined) delete process.env.CHECKSLIP_API_KEY;
    else process.env.CHECKSLIP_API_KEY = savedEnv;
  });

  it("sends the API key as a Bearer token with JSON and a User-Agent", async () => {
    const { checkslip, calls } = client([json(FOUND)]);
    const result = await checkslip.slips.lookup({ qr: QR });

    expect(result.outcome).toBe("FOUND");
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.method).toBe("POST");
    expect(call.url.toString()).toBe("https://api.checkslip.com/api/slips/lookup");
    expect(call.headers.get("authorization")).toBe(`Bearer ${TEST_KEY}`);
    expect(call.headers.get("content-type")).toBe("application/json");
    expect(call.headers.get("user-agent")).toBe(`checkslip-js/${VERSION}`);
    expect(JSON.parse(String(call.body))).toEqual({ qr: QR });
  });

  it("sends client_reference with a QR lookup", async () => {
    const { checkslip, calls } = client([json(FOUND)]);
    await checkslip.slips.lookup({ qr: QR, client_reference: "ORDER-10023" });
    expect(JSON.parse(String(calls[0]!.body))).toEqual({ qr: QR, client_reference: "ORDER-10023" });
  });

  it("uses a custom baseUrl, including one with a path", async () => {
    const { checkslip, calls } = client([json({ items: [] })], { baseUrl: "http://localhost:8080/gw" });
    await checkslip.banks.list();
    expect(calls[0]!.url.toString()).toBe("http://localhost:8080/gw/api/banks");
  });

  it("reads CHECKSLIP_API_KEY when apiKey is not passed", async () => {
    process.env.CHECKSLIP_API_KEY = "csk_from_env";
    const { checkslip, calls } = client([json({ items: [] })], { apiKey: undefined });
    await checkslip.banks.list();
    expect(calls[0]!.headers.get("authorization")).toBe("Bearer csk_from_env");
  });

  it("throws when there is no API key", () => {
    delete process.env.CHECKSLIP_API_KEY;
    expect(() => new Checkslip({ fetch: async () => json({}) })).toThrow(CheckslipError);
  });

  it("rejects invalid maxRetries and timeoutMs", () => {
    expect(() => new Checkslip({ apiKey: TEST_KEY, maxRetries: -1 })).toThrow(/maxRetries/);
    expect(() => new Checkslip({ apiKey: TEST_KEY, timeoutMs: 0 })).toThrow(/timeoutMs/);
  });

  it("does not let per-call headers replace Authorization", async () => {
    const { checkslip, calls } = client([json({ items: [] })], { defaultHeaders: { "X-Team": "ops" } });
    await checkslip.banks.list({ headers: { Authorization: "Bearer other", traceparent: "00-abc" } });
    const headers = calls[0]!.headers;
    expect(headers.get("authorization")).toBe(`Bearer ${TEST_KEY}`);
    expect(headers.get("x-team")).toBe("ops");
    expect(headers.get("traceparent")).toBe("00-abc");
  });

  it("encodes path parameters", async () => {
    const { checkslip, calls } = client([json({})]);
    await checkslip.slips.get("a/b c");
    expect(calls[0]!.url.pathname).toBe("/api/slips/a%2Fb%20c");
  });

  it("serializes query arrays the way the spec says, per parameter", async () => {
    const { checkslip, calls } = client([json({ items: [], next_cursor: null })]);
    await checkslip.slips.list({
      outcome: ["FOUND", "PENDING"],
      charged: ["true", "unsettled"],
      limit: 50,
    });
    const url = calls[0]!.url;
    expect(url.searchParams.get("outcome")).toBe("FOUND,PENDING");
    expect(url.searchParams.getAll("charged")).toEqual(["true", "unsettled"]);
    expect(url.searchParams.get("limit")).toBe("50");
    expect(url.searchParams.has("cursor")).toBe(false);
  });

  it("returns undefined for 204 No Content", async () => {
    const { checkslip, calls } = client([new Response(null, { status: 204 })]);
    await expect(checkslip.webhooks.endpoints.delete("ep_1")).resolves.toBeUndefined();
    expect(calls[0]!.method).toBe("DELETE");
  });

  it("sends merge-patch JSON for endpoint updates", async () => {
    const { checkslip, calls } = client([json({ id: "ep_1" })]);
    await checkslip.webhooks.endpoints.update("ep_1", { enabled: false });
    expect(calls[0]!.method).toBe("PATCH");
    expect(calls[0]!.headers.get("content-type")).toBe("application/merge-patch+json");
    expect(JSON.parse(String(calls[0]!.body))).toEqual({ enabled: false });
  });

  it("returns the raw Response for file downloads", async () => {
    const { checkslip, calls } = client([
      new Response("a,b\n1,2\n", { headers: { "Content-Type": "text/csv" } }),
    ]);
    const res = await checkslip.slips.exports.downloadPart("exp_1", 2, { sig: "s1g" });
    expect(await res.text()).toBe("a,b\n1,2\n");
    expect(calls[0]!.url.pathname).toBe("/api/slips/exports/exp_1/parts/2");
    expect(calls[0]!.url.searchParams.get("sig")).toBe("s1g");
  });

  it("routes each resource method to the path in the spec", async () => {
    const routes: Array<[string, string, (c: Checkslip) => Promise<unknown>]> = [
      ["GET", "/api/billing/balance", (c) => c.billing.balance.get()],
      ["GET", "/api/billing/billing-info", (c) => c.billing.info.get()],
      ["PUT", "/api/billing/billing-info", (c) => c.billing.info.update({} as never)],
      ["GET", "/api/billing/packages", (c) => c.billing.packages.list()],
      ["GET", "/api/billing/orders/o1", (c) => c.billing.orders.get("o1")],
      ["POST", "/api/billing/orders/o1/sync", (c) => c.billing.orders.sync("o1")],
      ["GET", "/api/billing/receipts/r1", (c) => c.billing.receipts.get("r1")],
      ["GET", "/api/usage", (c) => c.usage.get({ from: "2026-11-01", to: "2026-11-30" })],
      ["GET", "/api/slips/counts", (c) => c.slips.counts({ from: "a", to: "b", bucket: "DAY" } as never)],
      ["POST", "/api/slips/exports", (c) => c.slips.exports.create({ columns: ["request_id"] })],
      ["GET", "/api/slips/exports/e1", (c) => c.slips.exports.get("e1")],
      ["GET", "/api/webhooks/event-types", (c) => c.webhooks.eventTypes.list()],
      [
        "POST",
        "/api/webhooks/endpoints",
        (c) => c.webhooks.endpoints.create({ url: "https://x.test", event_types: ["slip.checked"] }),
      ],
      ["GET", "/api/webhooks/endpoints/ep1", (c) => c.webhooks.endpoints.get("ep1")],
      ["GET", "/api/webhooks/deliveries/d1", (c) => c.webhooks.deliveries.get("d1")],
      ["GET", "/api/audit/events/ev1", (c) => c.audit.events.get("ev1")],
      ["GET", "/api/audit/requests/rq1", (c) => c.audit.requests.get("rq1")],
      ["GET", "/api/audit/exports/x1", (c) => c.audit.exports.get("x1")],
      ["GET", "/api/audit/exports/x1/file", (c) => c.audit.exports.download("x1")],
    ];
    for (const [method, path, call] of routes) {
      const { checkslip, calls } = client([json({})]);
      await call(checkslip);
      expect(`${calls[0]!.method} ${calls[0]!.url.pathname}`).toBe(`${method} ${path}`);
    }
  });
});
