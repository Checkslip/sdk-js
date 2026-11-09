import { Checkslip, type ClientOptions, type FetchLike } from "../src/index.js";

/** One request the mocked fetch received. */
export interface RecordedCall {
  url: URL;
  method: string;
  headers: Headers;
  body: BodyInit | null | undefined;
}

type Reply = Response | Error | ((call: RecordedCall) => Response | Promise<Response>);

/** A fetch that answers from a queue and records every call. */
export function mockFetch(...replies: Reply[]) {
  const calls: RecordedCall[] = [];
  const fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const call: RecordedCall = {
      url: new URL(String(input)),
      method: init.method ?? "GET",
      headers: new Headers(init.headers),
      body: init.body,
    };
    calls.push(call);
    const reply = replies.shift();
    if (reply === undefined) throw new Error(`unexpected request ${call.method} ${call.url}`);
    if (reply instanceof Error) throw reply;
    if (typeof reply === "function") return reply(call);
    return reply;
  };
  return { fetch: fetch as unknown as FetchLike, calls };
}

/** A JSON response. */
export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/** An RFC 9457 problem response. */
export function problem(
  status: number,
  code: string,
  headers: Record<string, string> = {},
  extra: Record<string, unknown> = {},
): Response {
  return new Response(
    JSON.stringify({
      type: `https://checkslip.com/problems/${code.toLowerCase().replaceAll("_", "-")}`,
      title: code,
      status,
      code,
      instance: "/api/test",
      ...extra,
    }),
    {
      status,
      headers: { "Content-Type": "application/problem+json", "X-Request-Id": "req_123", ...headers },
    },
  );
}

export const TEST_KEY = "csk_test_0000000000000000";

/** A client wired to a mocked fetch. */
export function client(replies: Reply[], options: ClientOptions = {}) {
  const mock = mockFetch(...replies);
  const checkslip = new Checkslip({ apiKey: TEST_KEY, fetch: mock.fetch, ...options });
  return { checkslip, calls: mock.calls };
}

export const QR = "00330006000001010306902126302105340875102TH9104F86F";

export const FOUND = {
  request_id: "0192d4e0-7c1a-7b3e-9f00-1a2b3c4d5e6f",
  outcome: "FOUND",
  checked_at: "2026-10-29T10:41:02+07:00",
  slip: {
    trans_ref: "630210534087",
    transferred_at: "2026-10-29T10:33:30+07:00",
    amount: { satang: 5000, currency: "THB" },
    sender: {
      bank: { code: "KKP", bot_code: "069", name_th: "ธนาคารเกียรตินาคินภัทร", name_en: "Kiatnakin Phatra Bank" },
      name_th: "นาย สมชาย ใ",
      name_en: "MR. SOMCHAI J",
      account: "0439",
    },
    receiver: {
      kind: "BANK_ACCOUNT",
      bank: { code: "GSB", bot_code: "030", name_th: "ธนาคารออมสิน", name_en: "Government Savings Bank" },
      name_th: "นางสาว สมหญิง ร",
      name_en: "MISS SOMYING R",
      account: "9681",
    },
  },
};

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
