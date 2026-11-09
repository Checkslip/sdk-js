import type { HttpClient } from "../core/http.js";

/** @internal Base class for API resource groups. */
export abstract class APIResource {
  /** @internal */
  protected readonly http: HttpClient;

  /** @internal */
  constructor(http: HttpClient) {
    this.http = http;
  }
}
