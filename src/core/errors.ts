import type { Problem } from "../types.js";

/** Options shared by every {@link CheckslipError}. */
export interface CheckslipErrorOptions {
  /** HTTP status of the response, when there was one. */
  status?: number | undefined;
  /** The `code` field of the problem body, for example `NO_CREDIT`. */
  code?: string | undefined;
  /** Value of the `X-Request-Id` response header. Quote it when you contact support. */
  requestId?: string | undefined;
  /** The parsed RFC 9457 problem body, when the response had one. */
  problem?: Problem | undefined;
  /** Response headers, when there was a response. */
  headers?: Headers | undefined;
  /** The underlying error, for network failures. */
  cause?: unknown;
}

/**
 * Base class for every error the SDK throws.
 *
 * API errors carry the HTTP `status`, the problem `code` and the `requestId`.
 * Network errors and webhook errors leave `status` undefined.
 *
 * @example
 * ```ts
 * try {
 *   await checkslip.slips.lookup({ qr });
 * } catch (err) {
 *   if (err instanceof CheckslipError) console.log(err.status, err.code, err.requestId);
 * }
 * ```
 */
export class CheckslipError extends Error {
  /** HTTP status of the response, or `undefined` if no response arrived. */
  readonly status: number | undefined;
  /** Machine-readable error code from the problem body, such as `RATE_LIMITED`. */
  readonly code: string | undefined;
  /** Value of the `X-Request-Id` response header. */
  readonly requestId: string | undefined;
  /** The full problem body as returned by the API. */
  readonly problem: Problem | undefined;
  /** Response headers, when there was a response. */
  readonly headers: Headers | undefined;

  constructor(message: string, options: CheckslipErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
    this.problem = options.problem;
    this.headers = options.headers;
  }
}

/** 400: the request was malformed, for example a bad query value or Idempotency-Key. */
export class BadRequestError extends CheckslipError {}

/** 401: the API key is missing, wrong, or revoked. */
export class AuthenticationError extends CheckslipError {}

/** 402: the account has no usable credit (`NO_CREDIT` or `CREDIT_EXPIRED`). */
export class InsufficientCreditError extends CheckslipError {}

/** 403: the API key does not have the permission this call needs. */
export class PermissionDeniedError extends CheckslipError {}

/** 404: the resource does not exist or belongs to another account. */
export class NotFoundError extends CheckslipError {}

/** 409: the request conflicts with current state, for example `IDEMPOTENCY_IN_FLIGHT`. */
export class ConflictError extends CheckslipError {}

/** 422: the request was understood but cannot be processed, for example `INVALID_QR`. */
export class UnprocessableEntityError extends CheckslipError {}

/** 429: too many requests. Wait `retryAfter` seconds before trying again. */
export class RateLimitError extends CheckslipError {
  /** Seconds to wait, from the `Retry-After` header. `undefined` if the header was absent. */
  readonly retryAfter: number | undefined;

  constructor(message: string, options: CheckslipErrorOptions & { retryAfter?: number | undefined }) {
    super(message, options);
    this.retryAfter = options.retryAfter;
  }
}

/** 5xx: the API or a bank behind it failed. Safe to retry with the same Idempotency-Key. */
export class InternalServerError extends CheckslipError {}

/** The request never got a response: DNS, TLS, connection reset, and similar. */
export class APIConnectionError extends CheckslipError {}

/** The request took longer than `timeoutMs`. */
export class APITimeoutError extends APIConnectionError {}

/** A webhook payload failed signature or timestamp checks. Reject the request. */
export class WebhookVerificationError extends CheckslipError {}

/** @internal Picks the error class for an HTTP status. */
export function errorClassForStatus(status: number): typeof CheckslipError {
  switch (status) {
    case 400:
      return BadRequestError;
    case 401:
      return AuthenticationError;
    case 402:
      return InsufficientCreditError;
    case 403:
      return PermissionDeniedError;
    case 404:
      return NotFoundError;
    case 409:
      return ConflictError;
    case 422:
      return UnprocessableEntityError;
    case 429:
      return RateLimitError;
    default:
      return status >= 500 ? InternalServerError : CheckslipError;
  }
}
