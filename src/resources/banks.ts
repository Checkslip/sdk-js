import type { RequestOptions } from "../core/http.js";
import type { SupportedBank, SupportedBankList } from "../types.js";
import { APIResource } from "./resource.js";

/** Banks Checkslip can look up transfers with. */
export class Banks extends APIResource {
  /**
   * Lists supported banks with how many days back each one can look.
   *
   * The API wraps the list in an object with nothing else in it, so the SDK
   * hands back the banks themselves.
   */
  async list(options?: RequestOptions): Promise<SupportedBank[]> {
    const body = await this.http.request<SupportedBankList>({
      method: "GET",
      path: "/api/banks",
      operationId: "listSupportedBanks",
      options,
    });
    return body.items;
  }
}
