import { type RequestOptions, segment } from "../core/http.js";
import { PagePromise } from "../core/pagination.js";
import type {
  ApiRequestListParams,
  ApiRequestRecord,
  AuditEvent,
  AuditEventListParams,
  EvidenceExport,
  EvidenceExportCreateParams,
  EvidenceExportListParams,
} from "../types.js";
import { APIResource } from "./resource.js";

/** The account's audit log, request log and evidence exports. */
export class Audit extends APIResource {
  /** Account activity such as API keys created or members removed. */
  readonly events: AuditEvents = new AuditEvents(this.http);
  /** Requests the account sent. */
  readonly requests: ApiRequests = new ApiRequests(this.http);
  /** Evidence files for auditors. */
  readonly exports: EvidenceExports = new EvidenceExports(this.http);
}

/** Account activity. */
export class AuditEvents extends APIResource {
  /** Lists activity, newest first. Defaults to the last 24 hours, at most 31 days per call. */
  list(params: AuditEventListParams = {}, options?: RequestOptions): PagePromise<AuditEvent> {
    return new PagePromise(
      (cursor) =>
        this.http.request({
          method: "GET",
          path: "/api/audit/events",
          operationId: "listAuditEvents",
          query: { ...params, cursor },
          options,
        }),
      params.cursor,
    );
  }

  /** Walks every page and yields each item, fetching pages as it goes. */
  listAll(params: AuditEventListParams = {}, options?: RequestOptions): AsyncIterable<AuditEvent> {
    return this.list(params, options);
  }

  /** Gets one activity record. */
  get(eventId: string, options?: RequestOptions): Promise<AuditEvent> {
    return this.http.request({
      method: "GET",
      path: `/api/audit/events/${segment(eventId)}`,
      operationId: "getAuditEvent",
      options,
    });
  }
}

/** Requests the account sent. */
export class ApiRequests extends APIResource {
  /** Lists requests, newest first. Defaults to the last 24 hours, at most 31 days per call. */
  list(params: ApiRequestListParams = {}, options?: RequestOptions): PagePromise<ApiRequestRecord> {
    return new PagePromise(
      (cursor) =>
        this.http.request({
          method: "GET",
          path: "/api/audit/requests",
          operationId: "listApiRequests",
          query: { ...params, cursor },
          options,
        }),
      params.cursor,
    );
  }

  /** Walks every page and yields each item, fetching pages as it goes. */
  listAll(params: ApiRequestListParams = {}, options?: RequestOptions): AsyncIterable<ApiRequestRecord> {
    return this.list(params, options);
  }

  /** Gets one request by its request id (the `X-Request-Id` of its response). */
  get(requestId: string, options?: RequestOptions): Promise<ApiRequestRecord> {
    return this.http.request({
      method: "GET",
      path: `/api/audit/requests/${segment(requestId)}`,
      operationId: "getApiRequest",
      options,
    });
  }
}

/** Evidence files for auditors. */
export class EvidenceExports extends APIResource {
  /** Lists evidence exports, newest first. */
  list(params: EvidenceExportListParams = {}, options?: RequestOptions): PagePromise<EvidenceExport> {
    return new PagePromise(
      (cursor) =>
        this.http.request({
          method: "GET",
          path: "/api/audit/exports",
          operationId: "listEvidenceExports",
          query: { ...params, cursor },
          options,
        }),
      params.cursor,
    );
  }

  /** Walks every page and yields each item, fetching pages as it goes. */
  listAll(params: EvidenceExportListParams = {}, options?: RequestOptions): AsyncIterable<EvidenceExport> {
    return this.list(params, options);
  }

  /**
   * Starts building an evidence file for closed UTC days. Returns `QUEUED`;
   * poll {@link EvidenceExports.get} until `READY` or `FAILED`. Sends an
   * Idempotency-Key, generated if you do not pass one.
   */
  create(params: EvidenceExportCreateParams, options?: RequestOptions): Promise<EvidenceExport> {
    return this.http.request({
      method: "POST",
      path: "/api/audit/exports",
      operationId: "createEvidenceExport",
      body: params,
      idempotency: "auto",
      options,
    });
  }

  /** Gets the status of one evidence export. */
  get(exportId: string, options?: RequestOptions): Promise<EvidenceExport> {
    return this.http.request({
      method: "GET",
      path: `/api/audit/exports/${segment(exportId)}`,
      operationId: "getEvidenceExport",
      options,
    });
  }

  /**
   * Downloads a READY evidence file as NDJSON. Returns the raw `Response` so
   * you can stream it. The `Repr-Digest` header carries the file's sha256.
   */
  download(exportId: string, options?: RequestOptions): Promise<Response> {
    return this.http.request({
      method: "GET",
      path: `/api/audit/exports/${segment(exportId)}/file`,
      operationId: "downloadEvidenceExport",
      responseType: "response",
      options,
    });
  }
}
