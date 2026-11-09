// Loads the built CommonJS bundle. Run after `npm run build`.
const assert = require("node:assert/strict");
const sdk = require("../../dist/index.cjs");

(async () => {
  const checkslip = new sdk.Checkslip({
    apiKey: "csk_smoke",
    fetch: async () =>
      new Response(JSON.stringify({ items: [], next_cursor: null }), {
        headers: { "Content-Type": "application/json" },
      }),
  });
  const page = await checkslip.slips.list();
  assert.deepEqual(page.items, []);
  assert.equal(page.hasNextPage(), false);
  assert.ok(new sdk.RateLimitError("x", { status: 429 }) instanceof sdk.CheckslipError);
  console.log(`cjs ok on node ${process.version}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
