// Loads the built ESM bundle and runs one lookup and one webhook check
// against a fake fetch. Run after `npm run build`.
import assert from "node:assert/strict";
import { Checkslip, NotFoundError, signWebhook, verifyWebhook } from "../../dist/index.js";

const seen = [];
const checkslip = new Checkslip({
  apiKey: "csk_smoke",
  fetch: async (url, init) => {
    seen.push({ url: String(url), init });
    return new Response(
      JSON.stringify({ request_id: "r1", outcome: "NOT_FOUND", checked_at: "x", slip: {} }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  },
});
const result = await checkslip.slips.lookup({ qr: "00330006000001010306902126302105340875102TH9104F86F" });
assert.equal(result.outcome, "NOT_FOUND");
assert.equal(seen[0].url, "https://api.checkslip.com/api/slips/lookup");
assert.match(seen[0].init.headers["Idempotency-Key"], /^[0-9a-f-]{36}$/);
assert.equal(typeof NotFoundError, "function");

const secret = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
const payload = '{"type":"webhook.test","timestamp":"2026-11-09T00:00:00Z","data":{"endpoint_id":"ep_1"}}';
const headers = await signWebhook({ id: "msg_1", payload, secret });
const event = await verifyWebhook({ payload, headers, secret });
assert.equal(event.type, "webhook.test");
const runtime =
  typeof globalThis.Deno !== "undefined"
    ? `deno ${globalThis.Deno.version.deno}`
    : typeof globalThis.Bun !== "undefined"
      ? `bun ${globalThis.Bun.version}`
      : `node ${process.version}`;
console.log(`esm ok on ${runtime}`);
