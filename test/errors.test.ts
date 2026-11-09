import { describe, expect, it } from "vitest";
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

  it("handles an error body that is not JSON", async () => {
    const { checkslip } = client([new Response("Bad Gateway", { status: 502 })], { maxRetries: 0 });
    const err = (await checkslip.billing.balance.get().catch((e: unknown) => e)) as ServerError;
    expect(err).toBeInstanceOf(ServerError);
    expect(err.status).toBe(502);
    expect(err.code).toBeUndefined();
    expect(err.message).toBe("502: Bad Gateway");
  });
});
