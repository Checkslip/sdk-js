import { type RequestOptions, segment } from "../core/http.js";
import { PagePromise } from "../core/pagination.js";
import type {
  ApiRequestListParams,
  ApiRequestRecord,
  AuditEvent,
  AuditEventListParams,
  ChainCheck,
  ChainCheckParams,
  Checkpoint,
  CheckpointListParams,
  EvidenceExport,
  EvidenceExportCreateParams,
  EvidenceExportListParams,
  JwkSet,
} from "../types.js";
import { APIResource } from "./resource.js";

/** The account's audit log, request log, signed checkpoints and evidence exports. */
export class Audit extends APIResource {
  /** Account activity such as API keys created or members removed. */
  readonly events: AuditEvents = new AuditEvents(this.http);
  /** Requests the account sent. */
  readonly requests: ApiRequests = new ApiRequests(this.http);
  /** Signed daily checkpoints of the audit hash chain. */
  readonly checkpoints: Checkpoints = new Checkpoints(this.http);
  /** Recompute the hash chain of one day. */
  readonly chain: Chain = new Chain(this.http);
  /** Evidence files for auditors. */
  readonly exports: EvidenceExports = new EvidenceExports(this.http);
  /** The public keys that sign checkpoints. */
  readonly signingKeys: SigningKeys = new SigningKeys(this.http);
}

/** The public keys that sign checkpoints. */
export class SigningKeys extends APIResource {
  /**
   * Returns the Ed25519 public keys that sign checkpoints, as a JWK Set.
   *
   * This is a standard JWKS, so it is handed back whole rather than unwrapped
   * to its `keys`.
   */
  get(options?: RequestOptions): Promise<JwkSet> {
    return this.http.request({
      method: "GET",
      path: "/api/audit/signing-keys",
      operationId: "getSigningKeys",
      options,
    });
  }
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

/** Signed daily checkpoints. */
export class Checkpoints extends APIResource {
  /** Lists checkpoints, newest day first. */
  list(params: CheckpointListParams = {}, options?: RequestOptions): PagePromise<Checkpoint> {
    return new PagePromise(
      (cursor) =>
        this.http.request({
          method: "GET",
          path: "/api/audit/checkpoints",
          operationId: "listCheckpoints",
          query: { ...params, cursor },
          options,
        }),
      params.cursor,
    );
  }

  /** Walks every page and yields each item, fetching pages as it goes. */
  listAll(params: CheckpointListParams = {}, options?: RequestOptions): AsyncIterable<Checkpoint> {
    return this.list(params, options);
  }

  /**
   * Returns the latest checkpoint for each record type.
   *
   * The API wraps these in an object with nothing else in it, so the SDK hands
   * back the checkpoints themselves.
   */
  async listLatest(options?: RequestOptions): Promise<Checkpoint[]> {
    const body = await this.http.request<{ items: Checkpoint[] }>({
      method: "GET",
      path: "/api/audit/checkpoints/latest",
      operationId: "getLatestCheckpoint",
      options,
    });
    return body.items;
  }
}

/** Hash chain checks. */
export class Chain extends APIResource {
  /**
   * Recomputes the hash chain of one record type for one UTC day and compares
   * it with the signed checkpoint. A mismatch comes back as `intact: false`,
   * not as an error.
   */
  check(params: ChainCheckParams, options?: RequestOptions): Promise<ChainCheck> {
    return this.http.request({
      method: "POST",
      path: "/api/audit/chain/checks",
      operationId: "checkChain",
      body: params,
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
