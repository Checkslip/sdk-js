import type { RequestOptions } from "../core/http.js";
import type { SupportedBankList } from "../types.js";
import { APIResource } from "./resource.js";

/** Banks Checkslip can look up transfers with. */
export class Banks extends APIResource {
  /** Lists supported banks with how many days back each one can look. */
  list(options?: RequestOptions): Promise<SupportedBankList> {
    return this.http.request({
      method: "GET",
      path: "/api/banks",
      operationId: "listSupportedBanks",
      options,
    });
  }
}
