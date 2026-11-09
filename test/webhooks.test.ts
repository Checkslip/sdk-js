import { describe, expect, it } from "vitest";
import { Checkslip, signWebhook, verifyWebhook, WebhookVerificationError } from "../src/index.js";

// Test vector published by the Standard Webhooks project.
const VECTOR = {
  secret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
  id: "msg_p5jXN8AQM9LWM0D4loKWxJek",
  timestamp: 1614265330,
  payload: '{"test": 2432232314}',
  signature: "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
};
const AT_VECTOR_TIME = VECTOR.timestamp * 1000;

// Two throwaway secrets in the whsec_ format (32 random bytes, base64).
const OLD_SECRET = "whsec_AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";
const NEW_SECRET = "whsec_ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8=";

const event = {
  type: "slip.checked",
  timestamp: "2026-11-09T03:00:00Z",
  data: {
    request_id: "0192d4e0-7c1a-7b3e-9f00-1a2b3c4d5e6f",
    outcome: "FOUND",
    checked_at: "2026-11-09T03:00:00Z",
    channel: "API",
    client_reference: "ORDER-1",
    resolved_after_pending: false,
  },
};

const vectorHeaders = () =>
  new Headers({
    "webhook-id": VECTOR.id,
    "webhook-timestamp": String(VECTOR.timestamp),
    "webhook-signature": VECTOR.signature,
  });

describe("verifyWebhook", () => {
  it("accepts the Standard Webhooks test vector", async () => {
    const parsed = await verifyWebhook({
      payload: VECTOR.payload,
      headers: vectorHeaders(),
      secret: VECTOR.secret,
      now: AT_VECTOR_TIME,
    });
    expect(parsed).toEqual({ test: 2432232314 });
  });

  it("produces the test vector signature with signWebhook", async () => {
    const headers = await signWebhook({
      id: VECTOR.id,
      timestamp: VECTOR.timestamp,
      payload: VECTOR.payload,
      secret: VECTOR.secret,
    });
    expect(headers["webhook-signature"]).toBe(VECTOR.signature);
  });

  it("round-trips a slip.checked event with a Node-style header object", async () => {
    const payload = JSON.stringify(event);
    const signed = await signWebhook({ id: "msg_1", payload, secret: NEW_SECRET });
    const nodeHeaders: Record<string, string | string[] | undefined> = { ...signed, host: "example.com" };
    const parsed = await verifyWebhook({ payload, headers: nodeHeaders, secret: NEW_SECRET });
    expect(parsed.type).toBe("slip.checked");
    if (parsed.type === "slip.checked") expect(parsed.data.outcome).toBe("FOUND");
  });

  it("accepts raw bytes as the payload", async () => {
    const bytes = new TextEncoder().encode(VECTOR.payload);
    await expect(
      verifyWebhook({ payload: bytes, headers: vectorHeaders(), secret: VECTOR.secret, now: AT_VECTOR_TIME }),
    ).resolves.toEqual({ test: 2432232314 });
  });

  it("rejects a changed body", async () => {
    await expect(
      verifyWebhook({
        payload: '{"test": 2432232315}',
        headers: vectorHeaders(),
        secret: VECTOR.secret,
        now: AT_VECTOR_TIME,
      }),
    ).rejects.toBeInstanceOf(WebhookVerificationError);
  });

  it("rejects the wrong secret", async () => {
    await expect(
      verifyWebhook({
        payload: VECTOR.payload,
        headers: vectorHeaders(),
        secret: OLD_SECRET,
        now: AT_VECTOR_TIME,
      }),
    ).rejects.toThrow("No webhook signature matched");
  });

  it("rejects a timestamp outside the tolerance, in both directions", async () => {
    for (const offset of [-301, 301]) {
      await expect(
        verifyWebhook({
          payload: VECTOR.payload,
          headers: vectorHeaders(),
          secret: VECTOR.secret,
          now: AT_VECTOR_TIME + offset * 1000,
        }),
      ).rejects.toThrow("webhook-timestamp");
    }
    await expect(
      verifyWebhook({
        payload: VECTOR.payload,
        headers: vectorHeaders(),
        secret: VECTOR.secret,
        now: AT_VECTOR_TIME + 299_000,
      }),
    ).resolves.toBeTruthy();
  });

  it("rejects missing headers and a non-numeric timestamp", async () => {
    await expect(verifyWebhook({ payload: "{}", headers: {}, secret: VECTOR.secret })).rejects.toThrow(
      "Missing webhook-id",
    );
    const bad = vectorHeaders();
    bad.set("webhook-timestamp", "yesterday");
    await expect(
      verifyWebhook({ payload: VECTOR.payload, headers: bad, secret: VECTOR.secret }),
    ).rejects.toThrow("Unix timestamp");
  });

  it("accepts either signature while a secret rotation overlaps", async () => {
    const payload = JSON.stringify(event);
    const ts = Math.floor(Date.now() / 1000);
    const oldSig = (await signWebhook({ id: "msg_2", timestamp: ts, payload, secret: OLD_SECRET }))[
      "webhook-signature"
    ];
    const newSig = (await signWebhook({ id: "msg_2", timestamp: ts, payload, secret: NEW_SECRET }))[
      "webhook-signature"
    ];
    const headers = {
      "webhook-id": "msg_2",
      "webhook-timestamp": String(ts),
      "webhook-signature": `${newSig} ${oldSig}`,
    };

    // A system still on the old secret, one already on the new one, and one holding both.
    await expect(verifyWebhook({ payload, headers, secret: OLD_SECRET })).resolves.toBeTruthy();
    await expect(verifyWebhook({ payload, headers, secret: NEW_SECRET })).resolves.toBeTruthy();
    await expect(verifyWebhook({ payload, headers, secret: [NEW_SECRET, OLD_SECRET] })).resolves.toBeTruthy();
  });

  it("ignores signatures of other versions", async () => {
    const headers = vectorHeaders();
    headers.set("webhook-signature", `v2,abc ${VECTOR.signature}`);
    await expect(
      verifyWebhook({ payload: VECTOR.payload, headers, secret: VECTOR.secret, now: AT_VECTOR_TIME }),
    ).resolves.toBeTruthy();
    headers.set("webhook-signature", "v2,abc");
    await expect(
      verifyWebhook({ payload: VECTOR.payload, headers, secret: VECTOR.secret, now: AT_VECTOR_TIME }),
    ).rejects.toThrow("no v1 signature");
  });

  it("is reachable from the client as webhooks.verify", async () => {
    const checkslip = new Checkslip({ apiKey: "csk_x", fetch: async () => new Response() });
    await expect(
      checkslip.webhooks.verify({
        payload: VECTOR.payload,
        headers: vectorHeaders(),
        secret: VECTOR.secret,
        now: AT_VECTOR_TIME,
      }),
    ).resolves.toEqual({ test: 2432232314 });
  });
});
