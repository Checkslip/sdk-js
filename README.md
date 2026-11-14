# @checkslip/sdk

[ภาษาไทย](./README.th.md)

The official JavaScript and TypeScript client for the [Checkslip API](https://checkslip.com/docs).

Checkslip looks up a Thai bank transfer with the sending bank. You send the text of the QR code on a slip, or a photo of the slip, and Checkslip returns what the bank holds for that transfer: amount, time, sender and receiver. Whether to accept the payment is your decision, made against your own order.

The package runs on Node.js 22 or later, Bun, Deno, Cloudflare Workers, Vercel Edge and other runtimes that have `fetch`. It has no runtime dependencies and ships ESM, CommonJS and TypeScript types.

## Install

```sh
npm install @checkslip/sdk
# or
bun add @checkslip/sdk
pnpm add @checkslip/sdk
yarn add @checkslip/sdk
```

Deno:

```ts
import { Checkslip } from "npm:@checkslip/sdk";
```

## Quick start

Create an API key in the Checkslip web app and keep it on your server. The client reads `CHECKSLIP_API_KEY` from the environment when you do not pass `apiKey`.

```ts
import { Checkslip } from "@checkslip/sdk";

const checkslip = new Checkslip({ apiKey: process.env.CHECKSLIP_API_KEY });
```

### Look up a slip by its QR text

Read the QR code on the slip with any QR reader and send the text.

```ts
const check = await checkslip.slips.lookup({
  qr: "00330006000001010306902126302105340875102TH9104F86F",
  client_reference: "ORDER-10023", // optional, your own id
});

if (check.outcome === "FOUND" && "sender" in check.slip) {
  console.log(check.slip.amount.satang / 100, "THB");
  console.log("from", check.slip.sender.name_en, "at", check.slip.sender.bank.code);
  console.log("to", check.slip.receiver.name_en, check.slip.receiver.account);
}
```

Amounts are in satang (100 satang = 1 baht). Account numbers come back as their last 4 digits.

### Look up a slip from an image

Pass a `Blob`, `File`, `Uint8Array`, Node `Buffer` or `ArrayBuffer`. JPEG, PNG and WebP up to 10 MB are accepted. Checkslip reads the QR code from the image and does not store the image.

```ts
import { readFile } from "node:fs/promises";

const check = await checkslip.slips.lookup({ image: await readFile("slip.jpg") });
```

From a form upload in a route handler:

```ts
const form = await request.formData();
const check = await checkslip.slips.lookup({ image: form.get("slip") as File });
```

### Outcomes

`outcome` on a lookup is one of:

| Outcome     | Meaning                                                                                                                                                                                                                                 | Credit used |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `FOUND`     | The bank returned the transfer. Details are in `slip`.                                                                                                                                                                                  | 1           |
| `NOT_FOUND` | The bank has no transfer with this reference.                                                                                                                                                                                           | 0           |
| `DUPLICATE` | This account already looked this transfer up and found it, within the time we keep transfer references · `duplicate_of` points to the check that found it                                                                               | 0           |
| `PENDING`   | The bank does not show the transfer yet. The API no longer returns this outcome: a lookup is answered in one call, and this case comes back as a 503 `UNAVAILABLE` error. The value stays in the type, so existing code still compiles. | 0           |

These are normal results, so the SDK returns them instead of throwing. Problems with the request itself, such as an unreadable QR code, come back as errors (see below). The full list is at [checkslip.com/docs/outcomes](https://checkslip.com/en/docs/outcomes).

## Errors

Every error the SDK throws extends `CheckslipError`. API errors carry:

- `status`: the HTTP status
- `code`: the `code` field of the problem body, such as `NO_CREDIT` or `INVALID_QR`
- `requestId`: the `X-Request-Id` header. Include it when you contact support.
- `problem`: the full [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem body

```ts
import {
  CheckslipError,
  InsufficientCreditError,
  RateLimitError,
  UnprocessableEntityError,
} from "@checkslip/sdk";

try {
  await checkslip.slips.lookup({ qr });
} catch (err) {
  if (err instanceof UnprocessableEntityError && err.code === "INVALID_QR") {
    // The text is not a slip QR code. Ask the customer for another photo.
  } else if (err instanceof InsufficientCreditError) {
    // Top up credits.
  } else if (err instanceof RateLimitError) {
    console.log(`retry in ${err.retryAfter} s`);
  } else if (err instanceof CheckslipError) {
    console.error(err.status, err.code, err.requestId, err.message);
  }
  throw err;
}
```

| Class                      | When                                                                    |
| -------------------------- | ----------------------------------------------------------------------- |
| `BadRequestError`          | 400                                                                     |
| `AuthenticationError`      | 401, the API key is missing, wrong or revoked                           |
| `InsufficientCreditError`  | 402, `NO_CREDIT` or `CREDIT_EXPIRED`                                    |
| `PermissionDeniedError`    | 403, the key lacks the scope this call needs                            |
| `NotFoundError`            | 404                                                                     |
| `ConflictError`            | 409                                                                     |
| `GoneError`                | 410, the resource is gone for good, such as an expired export           |
| `UnprocessableEntityError` | 422, for example `INVALID_QR`, `QR_TAMPERED`, `TOO_OLD`, `INVALID_FILE` |
| `RateLimitError`           | 429, with `retryAfter` in seconds                                       |
| `ServerError`              | 5xx other than 503                                                      |
| `ServiceUnavailableError`  | 503, up but temporarily unable to serve                                 |
| `ConnectionError`          | no response arrived (DNS, TLS, reset connection, or `timeoutMs`)        |
| `UnexpectedResponseError`  | a status with no class of its own, such as 413 or 415                   |
| `WebhookVerificationError` | a webhook signature or timestamp did not check out                      |

A request cut off by `timeoutMs` is a `ConnectionError` with `timeout` set to `true`, so you can tell a
timeout from a refused connection without catching a second class.

`CheckslipError` is the base class of all of them: catch it when you only want one branch.

Every error code and what to do about it: [checkslip.com/docs/errors](https://checkslip.com/en/docs/errors).

## Retries

The client retries on its own, up to `maxRetries` times (default 2), waiting 0.5 s, then 1 s, then 2 s and so on with random jitter, up to 8 s. It only retries when repeating the request cannot do anything twice:

- 429 on any request. When the response has `Retry-After`, the client waits that long. If `Retry-After` is more than 60 seconds it throws `RateLimitError` instead of waiting.
- 409 `IDEMPOTENCY_IN_FLIGHT`, which means the first request with the same Idempotency-Key is still running.
- 408, 5xx, network errors and timeouts, but only on GET, PUT and DELETE requests and on requests that carry an Idempotency-Key.

Turn retries off with `maxRetries: 0`, on the client or for one call.

## Idempotency

`slips.lookup()` always sends an `Idempotency-Key` header. A repeat with the same key returns the first result and never uses a second credit. If you do not pass a key, the SDK generates a random UUID for each call and reuses it for that call's retries.

The generated key only protects retries inside one call. If your process can crash and run the same job again, pass a key built from your own data so the second run gets the first result:

```ts
await checkslip.slips.lookup({ qr }, { idempotencyKey: `order-${order.id}-slip-1` });
```

The calls the API requires a key for (`webhooks.endpoints.rotateSecret`, `sendTest`, `recover`, `webhooks.deliveries.redeliver`, `audit.exports.create`) get a generated one in the same way. Any other call accepts `idempotencyKey` too.

## Pagination

Every list has a pair of methods. `listAll()` walks every page and yields each item, following `next_cursor` for you:

```ts
for await (const record of checkslip.slips.listAll({ outcome: ["FOUND"], limit: 100 })) {
  console.log(record.request_id, record.slip?.trans_ref);
}
```

`list()` gives you one page at a time:

```ts
let page = await checkslip.slips.list({ trans_ref: "630210534087" });
console.log(page.items);
while (page.hasNextPage()) {
  page = await page.getNextPage();
  console.log(page.items);
}
```

To resume later, store `page.nextCursor` and pass it back as `cursor`.

## Webhooks

Checkslip sends a `slip.checked` message to your endpoints when a lookup finishes. Messages are signed with the [Standard Webhooks](https://www.standardwebhooks.com) scheme. Check the signature before you trust a message:

```ts
import { verifyWebhook, WebhookVerificationError } from "@checkslip/sdk";

export async function POST(request: Request) {
  const payload = await request.text(); // the raw body, before JSON parsing
  try {
    const event = await verifyWebhook({
      payload,
      headers: request.headers,
      secret: process.env.CHECKSLIP_WEBHOOK_SECRET!,
    });
    if (event.type === "slip.checked") {
      // event.data.request_id, event.data.outcome, event.data.client_reference
    }
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof WebhookVerificationError) return new Response(null, { status: 400 });
    throw err;
  }
}
```

With Express, read the body as raw bytes and pass `req.headers` as it is:

```ts
app.post("/checkslip/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const event = await verifyWebhook({ payload: req.body, headers: req.headers, secret });
  // ...
  res.sendStatus(204);
});
```

`verifyWebhook` rejects a message when:

- the `webhook-id`, `webhook-timestamp` or `webhook-signature` header is missing
- `webhook-timestamp` is more than 5 minutes from your clock (change it with `toleranceSeconds`)
- no `v1` signature matches the secret

Checkslip retries a message that does not get a 2xx answer, and every retry has the same `webhook-id`. Store the ids you have handled and skip repeats.

After you rotate a secret, the old one works for 24 hours and each message carries two signatures. Pass both secrets during the switch: `secret: [newSecret, oldSecret]`.

To send a signed test request to your own handler, use `signWebhook({ id, payload, secret })`, which returns the three headers. `checkslip.webhooks.endpoints.sendTest(endpointId)` asks Checkslip to send a real `webhook.test` message.

Managing endpoints:

```ts
const endpoint = await checkslip.webhooks.endpoints.create({
  url: "https://example.com/checkslip/webhook",
  event_types: ["slip.checked"],
});
// endpoint.secret is shown only in this response. Store it now.

for await (const delivery of checkslip.webhooks.deliveries.list({ status: "FAILED" })) {
  await checkslip.webhooks.deliveries.redeliver(delivery.id);
}
```

## Other resources

```ts
await checkslip.billing.balance.get(); // credits left, low-credit flag
await checkslip.usage.get({ from: "2026-11-01", to: "2026-11-30" });
await checkslip.banks.list(); // supported banks
await checkslip.slips.get(requestId); // one past lookup
await checkslip.slips.counts({ from, to, bucket: "DAY" });
await checkslip.slips.exports.create({ columns: ["request_id", "outcome", "slip.trans_ref"] });
await checkslip.audit.events.list(); // account activity, one page
for await (const event of checkslip.audit.events.listAll()) {
  /* every page */
}
await checkslip.audit.requests.list({ trans_ref }); // request log
await checkslip.audit.exports.create({ from_day, to_day });
```

`slips.exports.downloadPart()` and `audit.exports.download()` return the raw `Response`, so you can stream the file instead of loading it into memory.

The API reference lists every endpoint: [checkslip.com/docs/reference](https://checkslip.com/en/docs/reference).

## Configuration

```ts
const checkslip = new Checkslip({
  apiKey: "csk_...", // default: process.env.CHECKSLIP_API_KEY
  baseUrl: "https://api.checkslip.com", // default
  timeoutMs: 30_000, // per attempt, default 30 s
  maxRetries: 2, // default 2
  fetch: customFetch, // default: global fetch
  defaultHeaders: { "X-My-App": "shop" }, // sent with every request
});
```

Every method takes a last `options` argument for one call:

```ts
await checkslip.slips.lookup(
  { qr },
  {
    idempotencyKey: "order-42-slip-1",
    timeoutMs: 10_000,
    maxRetries: 0,
    signal: AbortSignal.timeout(15_000),
    headers: { "X-My-App": "shop" },
  },
);
```

### Browsers

The constructor throws in a web page, because anyone who opens the page can read the API key from it. Call Checkslip from your server. If you understand the risk (for example in an internal tool with a restricted key), pass `dangerouslyAllowBrowser: true`.

## TypeScript

Response and parameter types are generated from the [OpenAPI document](https://checkslip.com/en/docs/reference) and exported by name, for example `SlipCheck`, `SlipCheckRecord`, `WebhookEvent`, `Balance` and `Problem`. Field names stay in snake_case, the same as the JSON the API sends. The raw generated `paths`, `components` and `operations` types are exported too.

## Links

- Documentation: https://checkslip.com/docs
- API reference: https://checkslip.com/docs/reference
- Error codes: https://checkslip.com/en/docs/errors
- Changelog: [CHANGELOG.md](./CHANGELOG.md)
- Security issues: [SECURITY.md](./SECURITY.md)

## License

MIT
