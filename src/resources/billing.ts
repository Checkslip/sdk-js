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
  /** The credit balance on this account. */
  readonly balance: BalanceResource = new BalanceResource(this.http);
  /** The billing details printed on receipts. */
  readonly info: BillingInfoResource = new BillingInfoResource(this.http);
  /** The credit packages on sale. */
  readonly packages: Packages = new Packages(this.http);
  /** The credit ledger: every top-up, charge and expiry. */
  readonly ledger: Ledger = new Ledger(this.http);
  /** Orders for credit packages. */
  readonly orders: Orders = new Orders(this.http);
  /** Receipts for paid orders. */
  readonly receipts: Receipts = new Receipts(this.http);
}

/** The credit balance on this account. */
export class BalanceResource extends APIResource {
  /** Returns the current credit balance and whether it is running low. */
  get(options?: RequestOptions): Promise<Balance> {
    return this.http.request({
      method: "GET",
      path: "/api/billing/balance",
      operationId: "getBalance",
      options,
    });
  }
}

/** The billing details printed on receipts. */
export class BillingInfoResource extends APIResource {
  /** Returns the billing details printed on receipts. */
  get(options?: RequestOptions): Promise<BillingInfo> {
    return this.http.request({
      method: "GET",
      path: "/api/billing/billing-info",
      operationId: "getBillingInfo",
      options,
    });
  }

  /** Replaces the billing details printed on receipts. */
  update(params: BillingInfo, options?: RequestOptions): Promise<BillingInfo> {
    return this.http.request({
      method: "PUT",
      path: "/api/billing/billing-info",
      operationId: "putBillingInfo",
      body: params,
      options,
    });
  }
}

/** The credit packages on sale. */
export class Packages extends APIResource {
  /**
   * Lists the credit packages on sale.
   *
   * The response is kept whole rather than unwrapped to the items, because it
   * also carries `prices_include_vat` and `checkout_open`.
   */
  list(options?: RequestOptions): Promise<PackageList> {
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

  /** Walks every page and yields each item, fetching pages as it goes. */
  listAll(params: LedgerListParams = {}, options?: RequestOptions): AsyncIterable<CreditEntry> {
    return this.list(params, options);
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

  /** Walks every page and yields each item, fetching pages as it goes. */
  listAll(params: OrderListParams = {}, options?: RequestOptions): AsyncIterable<Order> {
    return this.list(params, options);
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

  /** Walks every page and yields each item, fetching pages as it goes. */
  listAll(params: ReceiptListParams = {}, options?: RequestOptions): AsyncIterable<Receipt> {
    return this.list(params, options);
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
