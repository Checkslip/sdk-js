import { commaSeparatedQuery } from "../generated/query-style.js";
import type { Problem } from "../types.js";
import { VERSION } from "../version.js";
import { type CheckslipError, ConnectionError, errorClassForStatus, RateLimitError } from "./errors.js";
import { isBrowser, randomUUID, sleep } from "./runtime.js";

/** Per-call options accepted as the last argument of every SDK method. */
export interface RequestOptions {
  /**
   * Idempotency-Key header for this call. Calls that accept one get a random
   * key when you leave this out. Pass your own (for example your order id
   * plus the slip number) to make retries across processes safe too.
   */
  idempotencyKey?: string;
  /** Abort the call, including any retry waits. */
  signal?: AbortSignal;
  /** Overrides the client's `timeoutMs` for this call. */
  timeoutMs?: number;
  /** Overrides the client's `maxRetries` for this call. */
  maxRetries?: number;
  /** Extra headers, for example `traceparent`. */
  headers?: Record<string, string>;
}

/** @internal Resolved client configuration used by {@link HttpClient}. */
export interface HttpClientConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  fetch: typeof fetch;
  defaultHeaders: Record<string, string>;
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** @internal A request as built by a resource method. */
export interface ApiRequest {
  method: Method;
  path: string;
  operationId: string;
  query?: object | undefined;
  /** JSON body. */
  body?: unknown;
  /** Content type of `body`. Defaults to `application/json`. */
  contentType?: string;
  /** Builds a multipart body. Called again on every attempt. */
  form?: () => FormData;
  /**
   * `"auto"`: send an Idempotency-Key, generating one if the caller gave none.
   * `"optional"`: send one only if the caller gave one.
   */
  idempotency?: "auto" | "optional";
  /** `"json"` (default) parses the body, `"response"` returns the raw Response. */
  responseType?: "json" | "response";
  options?: RequestOptions | undefined;
}

/** Longest Retry-After the client waits for on its own. Longer waits surface as errors. */
export const MAX_RETRY_AFTER_SECONDS = 60;
const INITIAL_DELAY_MS = 500;
const MAX_DELAY_MS = 8_000;

const IDEMPOTENT_METHODS = new Set<Method>(["GET", "PUT", "DELETE"]);

/** @internal Sends requests, applies retries, and turns error responses into exceptions. */
export class HttpClient {
  constructor(private readonly config: HttpClientConfig) {}

  /** Sends a request and returns the parsed JSON body (or the raw Response). */
  async request<T>(req: ApiRequest): Promise<T> {
    const options = req.options ?? {};
    const maxRetries = options.maxRetries ?? this.config.maxRetries;
    const timeoutMs = options.timeoutMs ?? this.config.timeoutMs;

    let idempotencyKey = options.idempotencyKey;
    if (idempotencyKey === undefined && req.idempotency === "auto") {
      idempotencyKey = await randomUUID();
    }

    const url = buildUrl(this.config.baseUrl, req.path, req.query, req.operationId);
    const retryable = IDEMPOTENT_METHODS.has(req.method) || idempotencyKey !== undefined;

    for (let attempt = 0; ; attempt++) {
      const headers: Record<string, string> = {
        Accept: "application/json, application/problem+json",
        ...(isBrowser() ? {} : { "User-Agent": `checkslip-js/${VERSION}` }),
        ...this.config.defaultHeaders,
        ...options.headers,
        Authorization: `Bearer ${this.config.apiKey}`,
      };
      if (idempotencyKey !== undefined) headers["Idempotency-Key"] = idempotencyKey;

      let body: BodyInit | undefined;
      if (req.form) {
        body = req.form();
      } else if (req.body !== undefined) {
        body = JSON.stringify(req.body);
        headers["Content-Type"] = req.contentType ?? "application/json";
      }

      let response: Response;
      try {
        response = await this.fetchWithTimeout(
          url,
          { method: req.method, headers, body },
          timeoutMs,
          options.signal,
        );
      } catch (err) {
        if (options.signal?.aborted) throw err;
        const error =
          err instanceof ConnectionError
            ? err
            : new ConnectionError(`Request to ${req.method} ${req.path} failed: ${describe(err)}`, {
                cause: err,
              });
        if (retryable && attempt < maxRetries) {
          await sleep(backoff(attempt), options.signal);
          continue;
        }
        throw error;
      }

      if (response.ok) {
        if (req.responseType === "response") return response as T;
        if (response.status === 204) return undefined as T;
        const text = await response.text();
        return (text === "" ? undefined : JSON.parse(text)) as T;
      }

      const error = await toError(response);
      const delay = retryDelay(error, retryable, attempt, maxRetries);
      if (delay !== undefined) {
        await sleep(delay, options.signal);
        continue;
      }
      throw error;
    }
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
    signal: AbortSignal | undefined,
  ): Promise<Response> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onAbort = () => controller.abort(signal?.reason);
    if (signal?.aborted) controller.abort(signal.reason);
    else signal?.addEventListener("abort", onAbort, { once: true });
    try {
      return await this.config.fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      if (timedOut) {
        throw new ConnectionError(`Request timed out after ${timeoutMs} ms.`, {
          cause: err,
          timeout: true,
        });
      }
      throw err;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
}

/**
 * Decides whether to retry an error response and how long to wait.
 * Returns `undefined` when the error should be thrown.
 *
 * - 429 is retried for any method: the API did not run the request.
 * - 409 `IDEMPOTENCY_IN_FLIGHT` is retried: the first call with this key is still running.
 * - 408 and 5xx are retried only when repeating the call is safe, that is
 *   for GET/PUT/DELETE or when an Idempotency-Key is set.
 */
function retryDelay(
  error: CheckslipError,
  retryable: boolean,
  attempt: number,
  maxRetries: number,
): number | undefined {
  if (attempt >= maxRetries) return undefined;
  const status = error.status ?? 0;
  const safe =
    status === 429 ||
    (status === 409 && error.code === "IDEMPOTENCY_IN_FLIGHT") ||
    (retryable && (status === 408 || status >= 500));
  if (!safe) return undefined;
  const retryAfter = parseRetryAfter(error.headers?.get("retry-after") ?? null);
  if (retryAfter !== undefined) {
    if (retryAfter > MAX_RETRY_AFTER_SECONDS) return undefined;
    return retryAfter * 1000;
  }
  return backoff(attempt);
}

/** Exponential backoff with jitter: a random delay between half and all of 0.5s, 1s, 2s, ... capped at 8s. */
export function backoff(attempt: number): number {
  const base = Math.min(MAX_DELAY_MS, INITIAL_DELAY_MS * 2 ** attempt);
  return base / 2 + Math.random() * (base / 2);
}

/** Parses Retry-After as seconds or an HTTP date. Returns seconds, or `undefined`. */
export function parseRetryAfter(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

async function toError(response: Response): Promise<CheckslipError> {
  const requestId = response.headers.get("x-request-id") ?? undefined;
  let problem: Problem | undefined;
  let text = "";
  try {
    text = await response.text();
    const parsed: unknown = text === "" ? undefined : JSON.parse(text);
    if (parsed && typeof parsed === "object") problem = parsed as Problem;
  } catch {
    // Not JSON. Keep the text for the message.
  }
  const code = typeof problem?.code === "string" ? problem.code : undefined;
  const summary = problem?.detail ?? problem?.title ?? (text.slice(0, 200) || response.statusText);
  const message = `${response.status}${code ? ` ${code}` : ""}${summary ? `: ${summary}` : ""}`;
  const options = { status: response.status, code, requestId, problem, headers: response.headers };
  if (response.status === 429) {
    return new RateLimitError(message, {
      ...options,
      retryAfter: parseRetryAfter(response.headers.get("retry-after")),
    });
  }
  const ErrorClass = errorClassForStatus(response.status);
  return new ErrorClass(message, options);
}

/** @internal Joins base URL, path and query. Arrays follow the spec's style per operation. */
export function buildUrl(
  baseUrl: string,
  path: string,
  query: object | undefined,
  operationId: string,
): string {
  const url = new URL(path.replace(/^\//, ""), baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (query) {
    const comma = commaSeparatedQuery[operationId] ?? [];
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        if (comma.includes(key)) url.searchParams.append(key, value.map(String).join(","));
        else for (const item of value) url.searchParams.append(key, String(item));
      } else {
        url.searchParams.append(key, String(value));
      }
    }
  }
  return url.toString();
}

/** @internal Encodes one path segment. */
export function segment(value: string | number): string {
  return encodeURIComponent(String(value));
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
