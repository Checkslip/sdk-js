/**
 * Named types for the Checkslip API, taken from the generated OpenAPI types.
 * Field names stay in snake_case, exactly as the API sends them.
 */
import type { components, operations } from "./generated/openapi.js";

export type { components, operations, paths } from "./generated/openapi.js";

type Schemas = components["schemas"];

/** Query parameters of an operation, with the optional wrapper removed. */
export type QueryOf<K extends keyof operations> = operations[K]["parameters"] extends {
  query?: infer Q;
}
  ? NonNullable<Q>
  : never;

/** JSON request body of an operation. */
export type BodyOf<K extends keyof operations> = operations[K] extends {
  requestBody?: { content: infer C };
}
  ? C extends { "application/json": infer B }
    ? B
    : C extends { "application/merge-patch+json": infer B }
      ? B
      : never
  : never;

/** JSON body of the first successful response of an operation. */
export type ResponseOf<K extends keyof operations> = operations[K]["responses"] extends infer R
  ? R extends { 200: { content: { "application/json": infer B } } }
    ? B
    : R extends { 201: { content: { "application/json": infer B } } }
      ? B
      : R extends { 202: { content: { "application/json": infer B } } }
        ? B
        : never
  : never;

// Errors

/** RFC 9457 problem body. Every error response has `type`, `title`, `status`, `code` and `instance`. */
export type Problem = Schemas["Problem"];

// Slips

/** Result of a lookup: the outcome and what the bank returned. */
export type SlipCheck = Schemas["SlipCheck"];
/** One past lookup, as returned by `slips.list()` and `slips.get()`. */
export type SlipCheckRecord = Schemas["SlipCheckRecord"];
/** Transfer data the bank returned. Present in full when the outcome is FOUND. */
export type Slip = Schemas["Slip"];
/** Shorter slip data for outcomes other than FOUND. */
export type SlipSummary = Schemas["SlipSummary"];
/** Outcome of a lookup in `SlipCheck`. */
export type LookupOutcome = Schemas["SlipCheck"]["outcome"];
/** Every outcome a stored lookup can have. */
export type CheckOutcome = Schemas["CheckOutcome"];
/** An amount in satang (1 THB = 100 satang). */
export type Money = Schemas["verify.Money"];
/** A bank as shown on a slip. */
export type Bank = Schemas["Bank"];
/** Sender of a transfer. */
export type Party = Schemas["Party"];
/** Receiver of a transfer. */
export type Receiver = Schemas["Receiver"];
/** Filters for `slips.list()`. */
export type SlipListParams = QueryOf<"listSlipChecks">;
/** Filters and bucket size for `slips.counts()`. */
export type SlipCountsParams = QueryOf<"countSlipChecks">;
/** Lookup counts per time bucket. */
export type SlipCounts = Schemas["SlipCounts"];
/** Body of `slips.exports.create()`. */
export type SlipExportRequest = Schemas["ExportRequest"];
/** A CSV export of lookups. */
export type SlipExport = Schemas["SlipExport"];
/** A column that can appear in a CSV export. */
export type ExportColumn = Schemas["ExportColumn"];

// Banks

/** A bank Checkslip can look up transfers with. */
export type SupportedBank = Schemas["SupportedBank"];
/** Response of `banks.list()`. */
export type SupportedBankList = Schemas["SupportedBankList"];

// Billing

/** Current credit balance. */
export type Balance = Schemas["Balance"];
/** Billing details printed on receipts. */
export type BillingInfo = Schemas["BillingInfo"];
/** One credit ledger entry. */
export type CreditEntry = Schemas["CreditEntry"];
/**
 * Why a lookup used no credit.
 *
 * `OTHER` means it was not charged and no reason was given. A customer
 * receives NOT_FOUND, DUPLICATE, UNAVAILABLE, INVALID_QR, INVALID_FILE,
 * QR_TAMPERED, TOO_OLD, SYSTEM_ERROR or OTHER. Any other value of this type
 * is never sent to you, so an exhaustive match needs a catch-all.
 */
export type FreeReason = Schemas["FreeReason"];
/** Filters for `billing.ledger.list()`. */
export type LedgerListParams = QueryOf<"listLedger">;
/** A credit package order. */
export type Order = Schemas["Order"];
/** Filters for `billing.orders.list()`. */
export type OrderListParams = QueryOf<"listOrders">;
/** Credit packages on sale. */
export type PackageList = Schemas["PackageList"];
/** One credit package. */
export type Package = Schemas["Package"];
/** A receipt for a paid order. */
export type Receipt = Schemas["Receipt"];
/** Parameters for `billing.receipts.list()`. */
export type ReceiptListParams = QueryOf<"listReceipts">;

// Usage

/** Usage counts per day or month. */
export type UsageReport = Schemas["Usage"];
/** Parameters for `usage.get()`. */
export type UsageParams = QueryOf<"getUsage">;
/**
 * Counts of lookups by how they were charged.
 *
 * `free_other` counts lookups that were not charged with no reason given.
 * `free_no_credit` and `free_hold_expired` are optional because the API no
 * longer counts them and drops both fields later, so handle them being
 * absent.
 */
export type UsageCounts = Schemas["UsageCounts"];

// Webhooks

/** A webhook event type. */
export type EventType = Schemas["EventType"];
/** Description of one event type. */
export type EventTypeInfo = Schemas["EventTypeInfo"];
/** A registered webhook endpoint. */
export type WebhookEndpoint = Schemas["Endpoint"];
/** A newly created endpoint, including its signing secret (shown only once). */
export type WebhookEndpointWithSecret = Schemas["EndpointWithSecret"];
/** Body of `webhooks.endpoints.create()`. */
export type WebhookEndpointCreateParams = Schemas["EndpointCreate"];
/** Body of `webhooks.endpoints.update()`. Send only the fields you want to change. */
export type WebhookEndpointUpdateParams = Schemas["EndpointUpdate"];
/** Parameters for `webhooks.endpoints.list()`. */
export type WebhookEndpointListParams = QueryOf<"listEndpoints">;
/** Response of `webhooks.endpoints.rotateSecret()`. */
export type SecretRotation = Schemas["SecretRotation"];
/** Body of `webhooks.endpoints.recover()`. */
export type RecoverParams = Schemas["RecoverRequest"];
/** Response of `webhooks.endpoints.recover()`. */
export type RecoverResult = Schemas["RecoverResult"];
/** One message queued for one endpoint. */
export type WebhookDelivery = Schemas["Delivery"];
/** A delivery with its payload and every attempt. */
export type WebhookDeliveryDetail = Schemas["DeliveryDetail"];
/** One attempt to send a delivery. */
export type WebhookDeliveryAttempt = Schemas["DeliveryAttempt"];
/** Filters for `webhooks.deliveries.list()`. */
export type WebhookDeliveryListParams = QueryOf<"listDeliveries">;
/** Data of a `slip.checked` message. */
export type SlipCheckedData = Schemas["SlipCheckedData"];
/** The `slip.checked` message sent when a lookup finishes. */
export interface SlipCheckedEvent {
  type: "slip.checked";
  /** When Checkslip created the message. */
  timestamp: string;
  data: SlipCheckedData;
}
/** The `webhook.test` message sent by `webhooks.endpoints.sendTest()`. */
export interface WebhookTestEvent {
  type: "webhook.test";
  /** When Checkslip created the message. */
  timestamp: string;
  data: { endpoint_id: Schemas["EndpointId"] };
}
/** Any message Checkslip sends to a webhook endpoint. */
export type WebhookEvent = SlipCheckedEvent | WebhookTestEvent;

// Audit

/** One audit event. */
export type AuditEvent = Schemas["AuditEventRecord"];
/** Filters for `audit.events.list()`. */
export type AuditEventListParams = QueryOf<"listAuditEvents">;
/** One recorded API request. */
export type ApiRequestRecord = Schemas["ApiRequestRecord"];
/** Filters for `audit.requests.list()`. */
export type ApiRequestListParams = QueryOf<"listApiRequests">;
/** An evidence export of audit records. */
export type EvidenceExport = Schemas["EvidenceExport"];
/** Body of `audit.exports.create()`. */
export type EvidenceExportCreateParams = Schemas["CreateExportRequest"];
/** Parameters for `audit.exports.list()`. */
export type EvidenceExportListParams = QueryOf<"listEvidenceExports">;
