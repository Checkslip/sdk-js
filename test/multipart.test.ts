import { describe, expect, it } from "vitest";
import { sniffImageType } from "../src/resources/slips.js";
import { client, FOUND, json, problem } from "./helpers.js";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

describe("multipart lookup", () => {
  it("uploads a Uint8Array as an image part with a guessed type and name", async () => {
    const { checkslip, calls } = client([json(FOUND)]);
    await checkslip.slips.lookup({ image: PNG, client_reference: "ORDER-7" });

    const call = calls[0]!;
    expect(call.body).toBeInstanceOf(FormData);
    // fetch sets the multipart boundary itself, so the SDK must not set Content-Type.
    expect(call.headers.has("content-type")).toBe(false);
    const form = call.body as FormData;
    const image = form.get("image") as File;
    expect(image.type).toBe("image/png");
    expect(image.name).toBe("slip.png");
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(PNG);
    expect(form.get("client_reference")).toBe("ORDER-7");
    expect(call.headers.get("idempotency-key")).toBeTruthy();
  });

  it("uploads a Blob and keeps its type", async () => {
    const { checkslip, calls } = client([json(FOUND)]);
    await checkslip.slips.lookup({ image: new Blob([JPEG], { type: "image/jpeg" }), filename: "a.jpg" });
    const image = (calls[0]!.body as FormData).get("image") as File;
    expect(image.type).toBe("image/jpeg");
    expect(image.name).toBe("a.jpg");
    expect((calls[0]!.body as FormData).has("client_reference")).toBe(false);
  });

  it("accepts an ArrayBuffer and an explicit content type", async () => {
    const { checkslip, calls } = client([json(FOUND)]);
    await checkslip.slips.lookup({ image: WEBP.buffer as ArrayBuffer, contentType: "image/webp" });
    const image = (calls[0]!.body as FormData).get("image") as File;
    expect(image.type).toBe("image/webp");
    expect(image.name).toBe("slip.webp");
  });

  it("builds a fresh form for each retry", async () => {
    const { checkslip, calls } = client([problem(503, "UNAVAILABLE", { "Retry-After": "0" }), json(FOUND)]);
    await checkslip.slips.lookup({ image: JPEG });
    expect(calls).toHaveLength(2);
    expect(calls[0]!.body).not.toBe(calls[1]!.body);
    expect(((calls[1]!.body as FormData).get("image") as File).size).toBe(JPEG.length);
    expect(calls[0]!.headers.get("idempotency-key")).toBe(calls[1]!.headers.get("idempotency-key"));
  });

  it("guesses JPEG, PNG and WebP from magic bytes", () => {
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(WEBP)).toBe("image/webp");
    expect(sniffImageType(new Uint8Array([1, 2, 3]))).toBe("application/octet-stream");
  });
});
