import { describe, expect, it } from "vitest";
import { backoff, parseRetryAfter } from "../src/core/http.js";
import {
  APIConnectionError,
  APITimeoutError,
  Checkslip,
  ConflictError,
  InternalServerError,
  RateLimitError,
} from "../src/index.js";
import { client, FOUND, json, problem, QR } from "./helpers.js";

const now = { "Retry-After": "0" };

/** A fetch that never answers until its signal aborts. */
function hangingFetch() {
  let attempts = 0;
  const fetch: typeof globalThis.fetch = (_input, init) =>
    new Promise((_, reject) => {
      attempts++;
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    });
  return { fetch, attempts: () => attempts };
}

describe("retries", () => {
  it("retries 429 and honors Retry-After, then succeeds", async () => {
    const { checkslip, calls } = client([
      problem(429, "RATE_LIMITED", now),
      problem(429, "RATE_LIMITED", now),
      json({ credits: 10 }),
    ]);
    await expect(checkslip.billing.balance()).resolves.toEqual({ credits: 10 });
    expect(calls).toHaveLength(3);
  });

  it("retries 429 even on POST without an Idempotency-Key", async () => {
    const { checkslip, calls } = client([problem(429, "RATE_LIMITED", now), json({ id: "ep_1" })]);
    await checkslip.webhooks.endpoints.create({
      url: "https://example.com/hook",
      event_types: ["slip.checked"],
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]!.headers.has("idempotency-key")).toBe(false);
  });

  it("gives up after maxRetries and throws the last error", async () => {
    const { checkslip, calls } = client(
      [problem(429, "RATE_LIMITED", now), problem(429, "RATE_LIMITED", now)],
      { maxRetries: 1 },
    );
    await expect(checkslip.billing.balance()).rejects.toBeInstanceOf(RateLimitError);
    expect(calls).toHaveLength(2);
  });

  it("does not wait out a Retry-After longer than 60 seconds", async () => {
    const { checkslip, calls } = client([problem(429, "RATE_LIMITED", { "Retry-After": "3600" })]);
    const err = (await checkslip.billing.balance().catch((e: unknown) => e)) as RateLimitError;
    expect(err.retryAfter).toBe(3600);
    expect(calls).toHaveLength(1);
  });

  it("retries 5xx on GET", async () => {
    const { checkslip, calls } = client([problem(503, "UNAVAILABLE", now), json({ items: [] })]);
    await checkslip.banks.list();
    expect(calls).toHaveLength(2);
  });

  it("retries 5xx on lookup and reuses the same Idempotency-Key", async () => {
    const { checkslip, calls } = client([
      problem(500, "INTERNAL", now),
      problem(503, "UNAVAILABLE", now),
      json(FOUND),
    ]);
    await checkslip.slips.lookup({ qr: QR });
    expect(calls).toHaveLength(3);
    const keys = calls.map((c) => c.headers.get("idempotency-key"));
    expect(keys[0]).toBeTruthy();
    expect(new Set(keys).size).toBe(1);
  });

  it("does not retry 5xx on a POST without an Idempotency-Key", async () => {
    const { checkslip, calls } = client([problem(500, "INTERNAL", now)]);
    await expect(
      checkslip.webhooks.endpoints.create({ url: "https://example.com/hook", event_types: ["slip.checked"] }),
    ).rejects.toBeInstanceOf(InternalServerError);
    expect(calls).toHaveLength(1);
  });

  it("retries 5xx on a POST when the caller passes an Idempotency-Key", async () => {
    const { checkslip, calls } = client([problem(500, "INTERNAL", now), json({ id: "ep_1" })]);
    await checkslip.webhooks.endpoints.create(
      { url: "https://example.com/hook", event_types: ["slip.checked"] },
      { idempotencyKey: "create-hook-1" },
    );
    expect(calls).toHaveLength(2);
    expect(calls[1]!.headers.get("idempotency-key")).toBe("create-hook-1");
  });

  it("retries IDEMPOTENCY_IN_FLIGHT but not other 409s", async () => {
    const inFlight = client([problem(409, "IDEMPOTENCY_IN_FLIGHT", now), json(FOUND)]);
    await inFlight.checkslip.slips.lookup({ qr: QR });
    expect(inFlight.calls).toHaveLength(2);

    const reused = client([problem(409, "ROTATION_IN_PROGRESS", now)]);
    await expect(reused.checkslip.webhooks.endpoints.rotateSecret("ep_1")).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(reused.calls).toHaveLength(1);
  });

  it("does not retry 4xx client errors", async () => {
    const { checkslip, calls } = client([problem(422, "INVALID_QR")]);
    await expect(checkslip.slips.lookup({ qr: QR })).rejects.toThrow("INVALID_QR");
    expect(calls).toHaveLength(1);
  });

  it("retries network errors on GET and wraps the final one", async () => {
    const { checkslip, calls } = client([new TypeError("fetch failed"), new TypeError("fetch failed")], {
      maxRetries: 1,
    });
    const err = (await checkslip.banks.list().catch((e: unknown) => e)) as APIConnectionError;
    expect(err).toBeInstanceOf(APIConnectionError);
    expect(err.status).toBeUndefined();
    expect((err.cause as Error).message).toBe("fetch failed");
    expect(calls).toHaveLength(2);
  });

  it("does not retry network errors on a POST without an Idempotency-Key", async () => {
    const { checkslip, calls } = client([new TypeError("socket hang up")]);
    await expect(checkslip.billing.orders.sync("ord_1")).rejects.toBeInstanceOf(APIConnectionError);
    expect(calls).toHaveLength(1);
  });

  it("turns maxRetries: 0 into a single attempt", async () => {
    const { checkslip, calls } = client([problem(503, "UNAVAILABLE", now)], { maxRetries: 0 });
    await expect(checkslip.banks.list()).rejects.toBeInstanceOf(InternalServerError);
    expect(calls).toHaveLength(1);
  });

  it("lets one call override maxRetries", async () => {
    const { checkslip, calls } = client([problem(503, "UNAVAILABLE", now)]);
    await expect(checkslip.banks.list({ maxRetries: 0 })).rejects.toBeInstanceOf(InternalServerError);
    expect(calls).toHaveLength(1);
  });

  it("throws APITimeoutError when an attempt runs past timeoutMs", async () => {
    const timed = new Checkslip({
      apiKey: "csk_x",
      fetch: hangingFetch().fetch,
      timeoutMs: 20,
      maxRetries: 0,
    });
    await expect(timed.banks.list()).rejects.toBeInstanceOf(APITimeoutError);
  });

  it("retries a timed-out GET", async () => {
    const hanging = hangingFetch();
    const timed = new Checkslip({ apiKey: "csk_x", fetch: hanging.fetch, timeoutMs: 20, maxRetries: 1 });
    await expect(timed.banks.list()).rejects.toBeInstanceOf(APITimeoutError);
    expect(hanging.attempts()).toBe(2);
  });

  it("stops at once when the caller aborts, and rethrows the abort as is", async () => {
    for (const call of [
      (c: Checkslip, signal: AbortSignal) => c.banks.list({ signal }),
      (c: Checkslip, signal: AbortSignal) => c.billing.orders.sync("ord_1", { signal }),
    ]) {
      const hanging = hangingFetch();
      const c = new Checkslip({ apiKey: "csk_x", fetch: hanging.fetch });
      const controller = new AbortController();
      const pending = call(c, controller.signal);
      controller.abort();
      const err = await pending.catch((e: unknown) => e);
      expect(err).not.toBeInstanceOf(APIConnectionError);
      expect((err as Error).name).toBe("AbortError");
      expect(hanging.attempts()).toBe(1);
    }
  });
});

describe("retry timing", () => {
  it("parses Retry-After seconds and HTTP dates", () => {
    expect(parseRetryAfter("12")).toBe(12);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter("soon")).toBeUndefined();
    const inTen = new Date(Date.now() + 10_000).toUTCString();
    const parsed = parseRetryAfter(inTen) ?? -1;
    expect(parsed).toBeGreaterThanOrEqual(9);
    expect(parsed).toBeLessThanOrEqual(11);
  });

  it("backs off exponentially with jitter, capped at 8 seconds", () => {
    for (let i = 0; i < 50; i++) {
      const first = backoff(0);
      expect(first).toBeGreaterThanOrEqual(250);
      expect(first).toBeLessThanOrEqual(500);
      const late = backoff(10);
      expect(late).toBeGreaterThanOrEqual(4_000);
      expect(late).toBeLessThanOrEqual(8_000);
    }
  });
});
