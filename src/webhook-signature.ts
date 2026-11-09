/**
 * Webhook signature checks.
 *
 * Checkslip signs messages with the Standard Webhooks scheme
 * (https://www.standardwebhooks.com):
 *
 * - `webhook-id`: message id, the same on every attempt. Use it to drop duplicates.
 * - `webhook-timestamp`: Unix seconds when this attempt was sent.
 * - `webhook-signature`: one or more `v1,<base64>` values separated by spaces,
 *   where each value is HMAC-SHA256 over `{webhook-id}.{webhook-timestamp}.{raw body}`
 *   keyed with the base64-decoded part of the secret after `whsec_`.
 *
 * During the 24 hours after a secret rotation the header carries two
 * signatures, one per secret.
 */
import { WebhookVerificationError } from "./core/errors.js";
import { base64ToBytes, bytesToBase64, getCrypto } from "./core/runtime.js";
import type { WebhookEvent } from "./types.js";

/** Headers as a `Headers` object or a plain object such as Node's `req.headers`. */
export type WebhookHeaders =
  | Headers
  | Record<string, string | string[] | undefined>
  | Iterable<[string, string]>;

/** Raw request body. Pass the bytes or text exactly as received, before any JSON parsing. */
export type WebhookPayload = string | Uint8Array | ArrayBuffer;

/** Options for {@link verifyWebhook}. */
export interface VerifyWebhookOptions {
  /** The raw request body. */
  payload: WebhookPayload;
  /** The request headers. */
  headers: WebhookHeaders;
  /**
   * The endpoint's signing secret (`whsec_...`). Pass an array to accept
   * either the old or the new secret while you roll out a rotation.
   */
  secret: string | readonly string[];
  /** Largest allowed gap between `webhook-timestamp` and now. Default 300 seconds. */
  toleranceSeconds?: number;
  /** Current time, for tests. Default `Date.now()`. */
  now?: Date | number;
}

/** Default allowed clock gap for `webhook-timestamp`, in seconds. */
export const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;

const encoder = new TextEncoder();

/**
 * Checks a webhook's signature and timestamp, then returns the parsed event.
 *
 * Throws {@link WebhookVerificationError} when a header is missing, the
 * timestamp is outside the tolerance, or no signature matches. Answer such a
 * request with 400 and do not act on it.
 *
 * @example
 * ```ts
 * // Bun, Deno, Cloudflare Workers, Next.js route handlers
 * const event = await verifyWebhook({
 *   payload: await request.text(),
 *   headers: request.headers,
 *   secret: process.env.CHECKSLIP_WEBHOOK_SECRET!,
 * });
 * if (event.type === "slip.checked") console.log(event.data.outcome);
 * ```
 */
export async function verifyWebhook(options: VerifyWebhookOptions): Promise<WebhookEvent> {
  const id = header(options.headers, "webhook-id");
  const timestamp = header(options.headers, "webhook-timestamp");
  const signatures = header(options.headers, "webhook-signature");
  if (!id || !timestamp || !signatures) {
    throw new WebhookVerificationError("Missing webhook-id, webhook-timestamp or webhook-signature header.");
  }
  if (!/^\d+$/.test(timestamp)) {
    throw new WebhookVerificationError("webhook-timestamp is not a Unix timestamp in seconds.");
  }
  const tolerance = options.toleranceSeconds ?? DEFAULT_WEBHOOK_TOLERANCE_SECONDS;
  const nowMs = options.now === undefined ? Date.now() : Number(options.now);
  const gap = Math.abs(Math.floor(nowMs / 1000) - Number(timestamp));
  if (gap > tolerance) {
    throw new WebhookVerificationError(
      `webhook-timestamp is ${gap} seconds away from the current time (limit ${tolerance}).`,
    );
  }

  const body = toBytes(options.payload);
  const signed = concat(encoder.encode(`${id}.${timestamp}.`), body);
  const candidates = signatures
    .split(" ")
    .filter((part) => part.startsWith("v1,"))
    .map((part) => part.slice(3));
  if (candidates.length === 0) {
    throw new WebhookVerificationError("webhook-signature has no v1 signature.");
  }

  const crypto = await getCrypto();
  const secrets = typeof options.secret === "string" ? [options.secret] : options.secret;
  if (secrets.length === 0) throw new WebhookVerificationError("No signing secret was given.");

  for (const secret of secrets) {
    const key = await crypto.subtle.importKey(
      "raw",
      secretBytes(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    for (const candidate of candidates) {
      let signature: Uint8Array;
      try {
        signature = base64ToBytes(candidate);
      } catch {
        continue;
      }
      // subtle.verify compares in constant time.
      if (await crypto.subtle.verify("HMAC", key, signature as BufferSource, signed as BufferSource)) {
        return parse(body);
      }
    }
  }
  throw new WebhookVerificationError("No webhook signature matched the signing secret.");
}

/** Options for {@link signWebhook}. */
export interface SignWebhookOptions {
  /** Value for `webhook-id`, such as `msg_...`. */
  id: string;
  /** Unix seconds for `webhook-timestamp`. Default: now. */
  timestamp?: number;
  /** The raw body you will send. */
  payload: WebhookPayload;
  /** The signing secret (`whsec_...`). */
  secret: string;
}

/**
 * Builds the three webhook headers for a payload, the same way Checkslip
 * does. Use it to send signed test requests to your own handler.
 */
export async function signWebhook(options: SignWebhookOptions): Promise<{
  "webhook-id": string;
  "webhook-timestamp": string;
  "webhook-signature": string;
}> {
  const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
  const crypto = await getCrypto();
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes(options.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = concat(encoder.encode(`${options.id}.${timestamp}.`), toBytes(options.payload));
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, signed as BufferSource));
  return {
    "webhook-id": options.id,
    "webhook-timestamp": timestamp,
    "webhook-signature": `v1,${bytesToBase64(mac)}`,
  };
}

function secretBytes(secret: string): BufferSource {
  const raw = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  try {
    return base64ToBytes(raw) as BufferSource;
  } catch {
    throw new WebhookVerificationError("The signing secret is not valid base64 after whsec_.");
  }
}

function header(headers: WebhookHeaders, name: string): string | undefined {
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name) ?? undefined;
  }
  if (Symbol.iterator in headers) {
    for (const [key, value] of headers as Iterable<[string, string]>) {
      if (key.toLowerCase() === name) return value;
    }
    return undefined;
  }
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== name || value === undefined) continue;
    return Array.isArray(value) ? value.join(" ") : value;
  }
  return undefined;
}

function toBytes(payload: WebhookPayload): Uint8Array {
  if (typeof payload === "string") return encoder.encode(payload);
  if (payload instanceof Uint8Array) return payload;
  return new Uint8Array(payload);
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function parse(body: Uint8Array): WebhookEvent {
  try {
    return JSON.parse(new TextDecoder().decode(body)) as WebhookEvent;
  } catch {
    throw new WebhookVerificationError("The signature matched but the body is not JSON.");
  }
}
