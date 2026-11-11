import { type RequestOptions, segment } from "../core/http.js";
import { PagePromise } from "../core/pagination.js";
import type {
  EventTypeInfo,
  RecoverParams,
  RecoverResult,
  SecretRotation,
  WebhookDelivery,
  WebhookDeliveryDetail,
  WebhookDeliveryListParams,
  WebhookEndpoint,
  WebhookEndpointCreateParams,
  WebhookEndpointListParams,
  WebhookEndpointUpdateParams,
  WebhookEndpointWithSecret,
  WebhookEvent,
} from "../types.js";
import { type VerifyWebhookOptions, verifyWebhook } from "../webhook-signature.js";
import { APIResource } from "./resource.js";

/** Webhook endpoints, deliveries and signature checks. */
export class Webhooks extends APIResource {
  /** Endpoints that receive messages. */
  readonly endpoints: WebhookEndpoints = new WebhookEndpoints(this.http);
  /** Messages queued for endpoints, with every send attempt. */
  readonly deliveries: WebhookDeliveries = new WebhookDeliveries(this.http);
  /** The event types Checkslip can send. */
  readonly eventTypes: EventTypes = new EventTypes(this.http);

  /**
   * Checks a webhook's signature and returns the parsed event. Same as the
   * standalone {@link verifyWebhook}, which needs no client or API key.
   */
  verify(options: VerifyWebhookOptions): Promise<WebhookEvent> {
    return verifyWebhook(options);
  }
}

/** The event types Checkslip can send. */
export class EventTypes extends APIResource {
  /**
   * Lists every event type Checkslip can send, such as `slip.checked`.
   *
   * The API wraps the list in an object with nothing else in it, so the SDK
   * hands back the event types themselves.
   */
  async list(options?: RequestOptions): Promise<EventTypeInfo[]> {
    const body = await this.http.request<{ items: EventTypeInfo[] }>({
      method: "GET",
      path: "/api/webhooks/event-types",
      operationId: "listEventTypes",
      options,
    });
    return body.items;
  }
}

/** Endpoints that receive messages. */
export class WebhookEndpoints extends APIResource {
  /** Lists the account's endpoints. */
  list(params: WebhookEndpointListParams = {}, options?: RequestOptions): PagePromise<WebhookEndpoint> {
    return new PagePromise(
      (cursor) =>
        this.http.request({
          method: "GET",
          path: "/api/webhooks/endpoints",
          operationId: "listEndpoints",
          query: { ...params, cursor },
          options,
        }),
      params.cursor,
    );
  }

  /** Walks every page and yields each item, fetching pages as it goes. */
  listAll(params: WebhookEndpointListParams = {}, options?: RequestOptions): AsyncIterable<WebhookEndpoint> {
    return this.list(params, options);
  }

  /**
   * Registers an https URL to receive messages. The response holds the
   * signing `secret`. It is shown only here, so store it now.
   */
  create(params: WebhookEndpointCreateParams, options?: RequestOptions): Promise<WebhookEndpointWithSecret> {
    return this.http.request({
      method: "POST",
      path: "/api/webhooks/endpoints",
      operationId: "createEndpoint",
      body: params,
      options,
    });
  }

  /** Gets one endpoint. */
  get(endpointId: string, options?: RequestOptions): Promise<WebhookEndpoint> {
    return this.http.request({
      method: "GET",
      path: `/api/webhooks/endpoints/${segment(endpointId)}`,
      operationId: "getEndpoint",
      options,
    });
  }

  /**
   * Changes an endpoint. Send only the fields to change; `enabled: true` turns a
   * disabled endpoint back on.
   *
   * Setting `enabled` to true fails with 409 `ENDPOINT_DISABLED_BY_STAFF` if the
   * Checkslip team turned the endpoint off. Reply to the email about it, or open
   * a case to have it turned on.
   */
  update(
    endpointId: string,
    params: WebhookEndpointUpdateParams,
    options?: RequestOptions,
  ): Promise<WebhookEndpoint> {
    return this.http.request({
      method: "PATCH",
      path: `/api/webhooks/endpoints/${segment(endpointId)}`,
      operationId: "updateEndpoint",
      body: params,
      contentType: "application/merge-patch+json",
      options,
    });
  }

  /** Deletes an endpoint. */
  delete(endpointId: string, options?: RequestOptions): Promise<void> {
    return this.http.request({
      method: "DELETE",
      path: `/api/webhooks/endpoints/${segment(endpointId)}`,
      operationId: "deleteEndpoint",
      options,
    });
  }

  /**
   * Resends every FAILED delivery of this endpoint created from `since` up to
   * `until`. Use it after your system was down. Sends an Idempotency-Key,
   * generated if you do not pass one.
   */
  recover(endpointId: string, params: RecoverParams, options?: RequestOptions): Promise<RecoverResult> {
    return this.http.request({
      method: "POST",
      path: `/api/webhooks/endpoints/${segment(endpointId)}/recover`,
      operationId: "recoverEndpoint",
      body: params,
      idempotency: "auto",
      options,
    });
  }

  /**
   * Issues a new signing secret, shown only in this response. The old one
   * keeps working for 24 hours. Sends an Idempotency-Key, generated if you do
   * not pass one.
   */
  rotateSecret(endpointId: string, options?: RequestOptions): Promise<SecretRotation> {
    return this.http.request({
      method: "POST",
      path: `/api/webhooks/endpoints/${segment(endpointId)}/secret/rotate`,
      operationId: "rotateEndpointSecret",
      idempotency: "auto",
      options,
    });
  }

  /**
   * Queues a `webhook.test` message to this endpoint and returns the
   * delivery. Uses no credit. Sends an Idempotency-Key, generated if you do
   * not pass one.
   */
  sendTest(endpointId: string, options?: RequestOptions): Promise<WebhookDelivery> {
    return this.http.request({
      method: "POST",
      path: `/api/webhooks/endpoints/${segment(endpointId)}/test`,
      operationId: "sendTestEvent",
      idempotency: "auto",
      options,
    });
  }
}

/** Messages queued for endpoints. Kept for 30 days. */
export class WebhookDeliveries extends APIResource {
  /** Lists deliveries, newest first. */
  list(params: WebhookDeliveryListParams = {}, options?: RequestOptions): PagePromise<WebhookDelivery> {
    return new PagePromise(
      (cursor) =>
        this.http.request({
          method: "GET",
          path: "/api/webhooks/deliveries",
          operationId: "listDeliveries",
          query: { ...params, cursor },
          options,
        }),
      params.cursor,
    );
  }

  /** Walks every page and yields each item, fetching pages as it goes. */
  listAll(params: WebhookDeliveryListParams = {}, options?: RequestOptions): AsyncIterable<WebhookDelivery> {
    return this.list(params, options);
  }

  /** Gets one delivery with its payload and every attempt. */
  get(deliveryId: string, options?: RequestOptions): Promise<WebhookDeliveryDetail> {
    return this.http.request({
      method: "GET",
      path: `/api/webhooks/deliveries/${segment(deliveryId)}`,
      operationId: "getDelivery",
      options,
    });
  }

  /**
   * Sends the same payload again with the original `webhook-id`. Your
   * handler should drop duplicates by `webhook-id`. Sends an
   * Idempotency-Key, generated if you do not pass one.
   */
  redeliver(deliveryId: string, options?: RequestOptions): Promise<WebhookDelivery> {
    return this.http.request({
      method: "POST",
      path: `/api/webhooks/deliveries/${segment(deliveryId)}/redeliver`,
      operationId: "redeliverDelivery",
      idempotency: "auto",
      options,
    });
  }
}
