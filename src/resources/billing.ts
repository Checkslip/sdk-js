import { type RequestOptions, segment } from "../core/http.js";
import { PagePromise } from "../core/pagination.js";
import type {
  Balance,
  BillingInfo,
  CreditEntry,
  LedgerListParams,
  Order,
  OrderListParams,
  PackageList,
  Receipt,
  ReceiptListParams,
} from "../types.js";
import { APIResource } from "./resource.js";

/** Credits, orders, receipts and billing details. */
export class Billing extends APIResource {
  /** The credit ledger: every top-up, charge and expiry. */
  readonly ledger: Ledger = new Ledger(this.http);
  /** Orders for credit packages. */
  readonly orders: Orders = new Orders(this.http);
  /** Receipts for paid orders. */
  readonly receipts: Receipts = new Receipts(this.http);

  /** Returns the current credit balance and whether it is running low. */
  balance(options?: RequestOptions): Promise<Balance> {
    return this.http.request({
      method: "GET",
      path: "/api/billing/balance",
      operationId: "getBalance",
      options,
    });
  }

  /** Returns the billing details printed on receipts. */
  getInfo(options?: RequestOptions): Promise<BillingInfo> {
    return this.http.request({
      method: "GET",
      path: "/api/billing/billing-info",
      operationId: "getBillingInfo",
      options,
    });
  }

  /** Replaces the billing details printed on receipts. */
  updateInfo(params: BillingInfo, options?: RequestOptions): Promise<BillingInfo> {
    return this.http.request({
      method: "PUT",
      path: "/api/billing/billing-info",
      operationId: "putBillingInfo",
      body: params,
      options,
    });
  }

  /** Lists the credit packages on sale. */
  packages(options?: RequestOptions): Promise<PackageList> {
    return this.http.request({
      method: "GET",
      path: "/api/billing/packages",
      operationId: "listPackages",
      options,
    });
  }
}

/** The credit ledger. */
export class Ledger extends APIResource {
  /** Lists ledger entries, newest first. */
  list(params: LedgerListParams = {}, options?: RequestOptions): PagePromise<CreditEntry> {
    return new PagePromise(
      (cursor) =>
        this.http.request({
          method: "GET",
          path: "/api/billing/ledger",
          operationId: "listLedger",
          query: { ...params, cursor },
          options,
        }),
      params.cursor,
    );
  }
}

/** Orders for credit packages. */
export class Orders extends APIResource {
  /** Lists orders, newest first. */
  list(params: OrderListParams = {}, options?: RequestOptions): PagePromise<Order> {
    return new PagePromise(
      (cursor) =>
        this.http.request({
          method: "GET",
          path: "/api/billing/orders",
          operationId: "listOrders",
          query: { ...params, cursor },
          options,
        }),
      params.cursor,
    );
  }

  /** Gets one order. */
  get(orderId: string, options?: RequestOptions): Promise<Order> {
    return this.http.request({
      method: "GET",
      path: `/api/billing/orders/${segment(orderId)}`,
      operationId: "getOrder",
      options,
    });
  }

  /** Asks Stripe for the payment result now instead of waiting for its notice, and returns the order. */
  sync(orderId: string, options?: RequestOptions): Promise<Order> {
    return this.http.request({
      method: "POST",
      path: `/api/billing/orders/${segment(orderId)}/sync`,
      operationId: "syncOrder",
      options,
    });
  }
}

/** Receipts for paid orders. */
export class Receipts extends APIResource {
  /** Lists receipts, newest first. */
  list(params: ReceiptListParams = {}, options?: RequestOptions): PagePromise<Receipt> {
    return new PagePromise(
      (cursor) =>
        this.http.request({
          method: "GET",
          path: "/api/billing/receipts",
          operationId: "listReceipts",
          query: { ...params, cursor },
          options,
        }),
      params.cursor,
    );
  }

  /** Gets one receipt. */
  get(receiptId: string, options?: RequestOptions): Promise<Receipt> {
    return this.http.request({
      method: "GET",
      path: `/api/billing/receipts/${segment(receiptId)}`,
      operationId: "getReceipt",
      options,
    });
  }
}
