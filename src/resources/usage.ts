import type { RequestOptions } from "../core/http.js";
import type { UsageParams, UsageReport } from "../types.js";
import { APIResource } from "./resource.js";

/** Lookup counts per day or month. */
export class Usage extends APIResource {
  /**
   * Returns lookup counts between two dates (Asia/Bangkok), split by how each
   * lookup was charged.
   *
   * @example
   * ```ts
   * const usage = await checkslip.usage.get({ from: "2026-11-01", to: "2026-11-30" });
   * console.log(usage.totals.charged);
   * ```
   */
  get(params: UsageParams, options?: RequestOptions): Promise<UsageReport> {
    return this.http.request({
      method: "GET",
      path: "/api/usage",
      operationId: "getUsage",
      query: params,
      options,
    });
  }
}
