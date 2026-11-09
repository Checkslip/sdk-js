import { CheckslipError } from "./core/errors.js";
import { HttpClient } from "./core/http.js";
import { isBrowser, readEnv } from "./core/runtime.js";
import { Audit } from "./resources/audit.js";
import { Banks } from "./resources/banks.js";
import { Billing } from "./resources/billing.js";
import { Slips } from "./resources/slips.js";
import { Usage } from "./resources/usage.js";
import { Webhooks } from "./resources/webhooks.js";

/** Default API address. */
export const DEFAULT_BASE_URL = "https://api.checkslip.com";
/** Default time limit for one attempt, in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 30_000;
/** Default number of retries after the first attempt. */
export const DEFAULT_MAX_RETRIES = 2;

/** Options for {@link Checkslip}. */
export interface ClientOptions {
  /**
   * Your API key, `csk_...`. Defaults to the `CHECKSLIP_API_KEY`
   * environment variable when the runtime has `process.env`.
   */
  apiKey?: string;
  /** API address. Default `https://api.checkslip.com`. */
  baseUrl?: string;
  /** Time limit for each attempt, in milliseconds. Default 30000. */
  timeoutMs?: number;
  /** Retries after the first attempt, for errors that are safe to retry. Default 2. Set 0 to turn retries off. */
  maxRetries?: number;
  /** A `fetch` implementation. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Headers sent with every request. */
  defaultHeaders?: Record<string, string>;
  /**
   * Allow the client in a web page. Off by default because anyone who opens
   * the page can read the API key. Call Checkslip from your server instead.
   */
  dangerouslyAllowBrowser?: boolean;
}

/**
 * Client for the Checkslip API.
 *
 * @example
 * ```ts
 * import { Checkslip } from "@checkslip/sdk";
 *
 * const checkslip = new Checkslip({ apiKey: process.env.CHECKSLIP_API_KEY });
 * const check = await checkslip.slips.lookup({ qr: "0033000600000101030..." });
 * ```
 */
export class Checkslip {
  /** Look up transfers and read past lookups. */
  readonly slips: Slips;
  /** Credits, orders, receipts and billing details. */
  readonly billing: Billing;
  /** Lookup counts per day or month. */
  readonly usage: Usage;
  /** Banks Checkslip can look up transfers with. */
  readonly banks: Banks;
  /** Webhook endpoints, deliveries and signature checks. */
  readonly webhooks: Webhooks;
  /** Audit log, request log and evidence exports. */
  readonly audit: Audit;

  /** The API address this client sends to. */
  readonly baseUrl: string;

  constructor(options: ClientOptions = {}) {
    const apiKey = options.apiKey ?? readEnv("CHECKSLIP_API_KEY");
    if (!apiKey) {
      throw new CheckslipError(
        "No API key. Pass apiKey to new Checkslip() or set the CHECKSLIP_API_KEY environment variable.",
      );
    }
    if (isBrowser() && !options.dangerouslyAllowBrowser) {
      throw new CheckslipError(
        "The Checkslip client is running in a web page, where visitors can read the API key. " +
          "Call Checkslip from your server, or pass dangerouslyAllowBrowser: true if you accept that risk.",
      );
    }
    const fetchImpl = options.fetch ?? (globalThis.fetch as typeof fetch | undefined);
    if (typeof fetchImpl !== "function") {
      throw new CheckslipError("No fetch implementation found. Pass one as the fetch option.");
    }
    const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isInteger(maxRetries) || maxRetries < 0) {
      throw new CheckslipError("maxRetries must be a whole number of 0 or more.");
    }
    if (!(timeoutMs > 0)) throw new CheckslipError("timeoutMs must be more than 0.");

    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    const http = new HttpClient({
      apiKey,
      baseUrl: this.baseUrl,
      timeoutMs,
      maxRetries,
      // Bind so runtimes that require `this === globalThis` (browsers, Workers) accept the call.
      fetch: options.fetch ?? fetchImpl.bind(globalThis),
      defaultHeaders: options.defaultHeaders ?? {},
    });

    this.slips = new Slips(http);
    this.billing = new Billing(http);
    this.usage = new Usage(http);
    this.banks = new Banks(http);
    this.webhooks = new Webhooks(http);
    this.audit = new Audit(http);
  }
}
