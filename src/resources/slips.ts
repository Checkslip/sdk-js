import { type RequestOptions, segment } from "../core/http.js";
import { PagePromise } from "../core/pagination.js";
import type {
  SlipCheck,
  SlipCheckRecord,
  SlipCounts,
  SlipCountsParams,
  SlipExport,
  SlipExportRequest,
  SlipListParams,
} from "../types.js";
import { APIResource } from "./resource.js";

/** Image data accepted by `slips.lookup({ image })`. Node `Buffer` works too. */
export type SlipImage = Blob | Uint8Array | ArrayBuffer;

/** Look up a slip by the text of its QR code. */
export interface LookupByQrParams {
  /** The text read from the slip's QR code. */
  qr: string;
  /** Your own reference, such as an order id. Returned on the result and in webhooks. Up to 128 printable ASCII characters. */
  client_reference?: string | null;
  image?: never;
}

/** Look up a slip from a photo or screenshot. Checkslip reads the QR code for you. */
export interface LookupByImageParams {
  /** JPEG, PNG or WebP, up to 10 MB and 50 megapixels. Checkslip does not store the image. */
  image: SlipImage;
  /** File name sent with the upload. Default `slip` plus an extension guessed from the bytes. */
  filename?: string;
  /** Content type of the image. Guessed from the bytes when left out. */
  contentType?: "image/jpeg" | "image/png" | "image/webp";
  /** Your own reference, such as an order id. */
  client_reference?: string | null;
  qr?: never;
}

/** Parameters for {@link Slips.lookup}. Pass either `qr` or `image`. */
export type LookupParams = LookupByQrParams | LookupByImageParams;

/** Look up transfers and read past lookups. */
export class Slips extends APIResource {
  /** CSV exports of past lookups. */
  readonly exports: SlipExports = new SlipExports(this.http);

  /**
   * Asks the sending bank about the transfer on a slip and returns what the
   * bank holds.
   *
   * Check `outcome`: `FOUND` means the bank returned the transfer in `slip`.
   * `NOT_FOUND` and `DUPLICATE` are normal results, not errors.
   * Deciding whether to accept the payment is up to you; compare `slip.amount`
   * and `slip.receiver` with your order. One credit is used only for `FOUND`.
   *
   * The call always sends an Idempotency-Key. If you do not pass
   * `options.idempotencyKey` the SDK generates one, so its own retries never
   * charge twice.
   *
   * @example
   * ```ts
   * const check = await checkslip.slips.lookup({ qr: "0033000600000101030..." });
   * if (check.outcome === "FOUND") console.log(check.slip);
   * ```
   */
  lookup(params: LookupParams, options?: RequestOptions): Promise<SlipCheck> {
    if ("image" in params && params.image !== undefined) {
      const { image, filename, contentType, client_reference } = params;
      return this.http.request({
        method: "POST",
        path: "/api/slips/lookup",
        operationId: "lookupSlip",
        idempotency: "auto",
        form: () => {
          const form = new FormData();
          const blob = toBlob(image, contentType);
          form.append("image", blob, filename ?? `slip${extensionFor(blob.type)}`);
          if (client_reference != null) form.append("client_reference", client_reference);
          return form;
        },
        options,
      });
    }
    const { qr, client_reference } = params as LookupByQrParams;
    return this.http.request({
      method: "POST",
      path: "/api/slips/lookup",
      operationId: "lookupSlip",
      idempotency: "auto",
      body: client_reference === undefined ? { qr } : { qr, client_reference },
      options,
    });
  }

  /**
   * Lists the account's lookups, newest first. Pass `trans_ref` to see
   * whether a slip was looked up before.
   *
   * @example
   * ```ts
   * for await (const record of checkslip.slips.list({ outcome: ["FOUND"] })) { ... }
   * ```
   */
  list(params: SlipListParams = {}, options?: RequestOptions): PagePromise<SlipCheckRecord> {
    return new PagePromise(
      (cursor) =>
        this.http.request({
          method: "GET",
          path: "/api/slips",
          operationId: "listSlipChecks",
          query: { ...params, cursor },
          options,
        }),
      params.cursor,
    );
  }

  /** Walks every page and yields each item, fetching pages as it goes. */
  listAll(params: SlipListParams = {}, options?: RequestOptions): AsyncIterable<SlipCheckRecord> {
    return this.list(params, options);
  }

  /** Gets one past lookup by its `request_id`. */
  get(requestId: string, options?: RequestOptions): Promise<SlipCheckRecord> {
    return this.http.request({
      method: "GET",
      path: `/api/slips/${segment(requestId)}`,
      operationId: "getSlipCheck",
      options,
    });
  }

  /** Counts lookups per time bucket, for charts. */
  counts(params: SlipCountsParams, options?: RequestOptions): Promise<SlipCounts> {
    return this.http.request({
      method: "GET",
      path: "/api/slips/counts",
      operationId: "countSlipChecks",
      query: params,
      options,
    });
  }
}

/** CSV exports of past lookups. */
export class SlipExports extends APIResource {
  /**
   * Starts a CSV export of lookups that match the filters. Small exports
   * come back ready; larger ones come back `QUEUED`, so poll {@link SlipExports.get}.
   *
   * Not available yet: the API does not accept this request, so calling it
   * returns an error.
   */
  create(params: SlipExportRequest, options?: RequestOptions): Promise<SlipExport> {
    return this.http.request({
      method: "POST",
      path: "/api/slips/exports",
      operationId: "createSlipExport",
      body: params,
      options,
    });
  }

  /**
   * Gets an export and, once ready, the signed links to its parts.
   *
   * Not available yet: the API does not accept this request, so calling it
   * returns an error.
   */
  get(exportId: string, options?: RequestOptions): Promise<SlipExport> {
    return this.http.request({
      method: "GET",
      path: `/api/slips/exports/${segment(exportId)}`,
      operationId: "getSlipExport",
      options,
    });
  }

  /**
   * Downloads one CSV part. `sig` is the `sig` query value from the part's
   * `url` in {@link SlipExport.parts}. Returns the raw `Response` so you can
   * stream the body instead of holding it in memory.
   *
   * Not available yet: the API does not accept this request, so calling it
   * returns an error.
   */
  downloadPart(
    exportId: string,
    part: number,
    params: { sig: string },
    options?: RequestOptions,
  ): Promise<Response> {
    return this.http.request({
      method: "GET",
      path: `/api/slips/exports/${segment(exportId)}/parts/${segment(part)}`,
      operationId: "downloadSlipExportPart",
      query: { sig: params.sig },
      responseType: "response",
      options,
    });
  }
}

function toBlob(image: SlipImage, contentType: string | undefined): Blob {
  if (typeof Blob !== "undefined" && image instanceof Blob) {
    if (contentType && image.type !== contentType) return new Blob([image], { type: contentType });
    return image;
  }
  const bytes = image instanceof Uint8Array ? image : new Uint8Array(image as ArrayBuffer);
  return new Blob([bytes as BlobPart], { type: contentType ?? sniffImageType(bytes) });
}

/** Guesses JPEG, PNG or WebP from the first bytes. */
export function sniffImageType(bytes: Uint8Array): string {
  const b = (i: number) => bytes[i] ?? -1;
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return "image/png";
  if (
    b(0) === 0x52 &&
    b(1) === 0x49 &&
    b(2) === 0x46 &&
    b(3) === 0x46 &&
    b(8) === 0x57 &&
    b(9) === 0x45 &&
    b(10) === 0x42 &&
    b(11) === 0x50
  ) {
    return "image/webp";
  }
  return "application/octet-stream";
}

function extensionFor(type: string): string {
  switch (type) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    default:
      return "";
  }
}
