import { describe, expect, it } from "bun:test";
import {
  AuthenticationError,
  BadRequestError,
  CheckslipError,
  ConflictError,
  GoneError,
  InsufficientCreditError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  ServerError,
  ServiceUnavailableError,
  UnexpectedResponseError,
  UnprocessableEntityError,
} from "../src/index.js";
import { client, problem, QR } from "./helpers.js";

describe("errors", () => {
  it("maps 401 to AuthenticationError with status, code, requestId and problem", async () => {
    const { checkslip } = client([problem(401, "UNAUTHENTICATED", {}, { detail: "Unknown API key." })]);
    const err = await checkslip.billing.balance.get().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthenticationError);
    expect(err).toBeInstanceOf(CheckslipError);
    const e = err as AuthenticationError;
    expect(e.status).toBe(401);
    expect(e.code).toBe("UNAUTHENTICATED");
    expect(e.requestId).toBe("req_123");
    expect(e.problem?.detail).toBe("Unknown API key.");
    expect(e.message).toBe("401 UNAUTHENTICATED: Unknown API key.");
    expect(e.name).toBe("AuthenticationError");
  });

  it.each([
    [400, "VALIDATION_FAILED", BadRequestError],
    [402, "NO_CREDIT", InsufficientCreditError],
    [403, "FORBIDDEN", PermissionDeniedError],
    [404, "NOT_FOUND", NotFoundError],
    [409, "IDEMPOTENCY_KEY_REUSED", ConflictError],
    [422, "INVALID_QR", UnprocessableEntityError],
    [410, "EXPORT_EXPIRED", GoneError],
    [500, "INTERNAL", ServerError],
    [503, "UNAVAILABLE", ServiceUnavailableError],
  ] as const)("maps %i %s to the matching class", async (status, code, ErrorClass) => {
    const { checkslip } = client([problem(status, code)], { maxRetries: 0 });
    const err = await checkslip.slips.lookup({ qr: QR }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ErrorClass);
    expect((err as CheckslipError).code).toBe(code);
    expect((err as CheckslipError).status).toBe(status);
  });

  it("uses UnexpectedResponseError for statuses without their own class", async () => {
    const { checkslip } = client([problem(413, "PAYLOAD_TOO_LARGE")]);
    const err = (await checkslip.slips.lookup({ qr: QR }).catch((e: unknown) => e)) as CheckslipError;
    expect(err.constructor).toBe(UnexpectedResponseError);
    expect(err).toBeInstanceOf(CheckslipError);
    expect(err.status).toBe(413);
    expect(err.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("exposes retryAfter on RateLimitError", async () => {
    const { checkslip } = client([problem(429, "RATE_LIMITED", { "Retry-After": "7" })], { maxRetries: 0 });
    const err = (await checkslip.billing.balance.get().catch((e: unknown) => e)) as RateLimitError;
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.retryAfter).toBe(7);
  });

  // verify contract 0.80.2. The reason says why a lookup has no definite
  // answer, and the API asks for a different wait depending on it.
  it.each([
    ["NOT_SEEN", "60", 60],
    ["SOURCE_DOWN", "30", 30],
    // A word added to the API after this version of the SDK: kept as sent, so
    // the caller can log it and fall back to the SOURCE_DOWN handling.
    ["BANK_REFUSED_US", "30", 30],
  ] as const)("exposes reason %s on a 503", async (reason, header, seconds) => {
    const { checkslip } = client([problem(503, "UNAVAILABLE", { "Retry-After": header }, { reason })], {
      maxRetries: 0,
    });
    const err = (await checkslip.slips
      .lookup({ qr: QR })
      .catch((e: unknown) => e)) as ServiceUnavailableError;
    expect(err).toBeInstanceOf(ServiceUnavailableError);
    expect(err.reason).toBe(reason);
    expect(err.retryAfter).toBe(seconds);
    expect(err.problem?.reason).toBe(reason);
  });

  it("leaves reason undefined when a 503 carries none", async () => {
    const { checkslip } = client([problem(503, "UNAVAILABLE", { "Retry-After": "30" })], { maxRetries: 0 });
    const err = (await checkslip.slips
      .lookup({ qr: QR })
      .catch((e: unknown) => e)) as ServiceUnavailableError;
    expect(err).toBeInstanceOf(ServiceUnavailableError);
    expect(err.reason).toBeUndefined();
    expect(err.retryAfter).toBe(30);
  });

  it("does not put a reason on an error that is not a 503", async () => {
    const { checkslip } = client([problem(422, "INVALID_QR", {}, { reason: "NOT_SEEN" })], { maxRetries: 0 });
    const err = (await checkslip.slips.lookup({ qr: QR }).catch((e: unknown) => e)) as CheckslipError;
    expect(err).toBeInstanceOf(UnprocessableEntityError);
    expect(err).not.toHaveProperty("reason");
  });

  it("handles an error body that is not JSON", async () => {
    const { checkslip } = client([new Response("Bad Gateway", { status: 502 })], { maxRetries: 0 });
    const err = (await checkslip.billing.balance.get().catch((e: unknown) => e)) as ServerError;
    expect(err).toBeInstanceOf(ServerError);
    expect(err.status).toBe(502);
    expect(err.code).toBeUndefined();
    expect(err.message).toBe("502: Bad Gateway");
  });
});
