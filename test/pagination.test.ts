import { describe, expect, it } from "bun:test";
import { Page } from "../src/index.js";
import { client, json } from "./helpers.js";

const record = (id: string) => ({
  request_id: id,
  outcome: "FOUND",
  checked_at: "2026-11-01T00:00:00Z",
  channel: "API",
});

describe("pagination", () => {
  it("walks every item across pages with for await", async () => {
    const { checkslip, calls } = client([
      json({ items: [record("a"), record("b")], next_cursor: "c1" }),
      json({ items: [record("c")], next_cursor: "c2" }),
      json({ items: [record("d")], next_cursor: null }),
    ]);
    const ids: string[] = [];
    for await (const item of checkslip.slips.list({ outcome: ["FOUND"], limit: 2 }))
      ids.push(item.request_id);

    expect(ids).toEqual(["a", "b", "c", "d"]);
    expect(calls.map((c) => c.url.searchParams.get("cursor"))).toEqual([null, "c1", "c2"]);
    for (const call of calls) {
      expect(call.url.searchParams.get("limit")).toBe("2");
      expect(call.url.searchParams.get("outcome")).toBe("FOUND");
    }
  });

  it("returns the first page when awaited and steps with getNextPage", async () => {
    const { checkslip, calls } = client([
      json({ items: [{ id: "ep_1" }], next_cursor: "n1" }),
      json({ items: [{ id: "ep_2" }], next_cursor: null }),
    ]);
    const first = await checkslip.webhooks.endpoints.list({ limit: 1 });
    expect(first).toBeInstanceOf(Page);
    expect(first.items.map((e) => e.id)).toEqual(["ep_1"]);
    expect(first.hasNextPage()).toBe(true);

    const second = await first.getNextPage();
    expect(second.items.map((e) => e.id)).toEqual(["ep_2"]);
    expect(second.hasNextPage()).toBe(false);
    await expect(second.getNextPage()).rejects.toThrow("No next page");
    expect(calls).toHaveLength(2);
  });

  it("yields whole pages from pages()", async () => {
    const { checkslip } = client([
      json({ items: [{ id: 1 }, { id: 2 }], next_cursor: "n1" }),
      json({ items: [{ id: 3 }], next_cursor: null }),
    ]);
    const sizes: number[] = [];
    const first = await checkslip.webhooks.deliveries.list();
    for await (const page of first.pages()) sizes.push(page.items.length);
    expect(sizes).toEqual([2, 1]);
  });

  it("starts from a cursor the caller passes", async () => {
    const { checkslip, calls } = client([json({ items: [], next_cursor: null })]);
    await checkslip.audit.events.list({ cursor: "resume-here" });
    expect(calls[0]!.url.searchParams.get("cursor")).toBe("resume-here");
  });

  it("stops on an empty last page", async () => {
    const { checkslip, calls } = client([json({ items: [], next_cursor: null })]);
    const items = [];
    for await (const item of checkslip.billing.ledger.list()) items.push(item);
    expect(items).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("surfaces errors from a later page", async () => {
    const { checkslip } = client([
      json({ items: [{ id: 1 }], next_cursor: "n1" }),
      new Response(JSON.stringify({ status: 400, code: "INVALID_CURSOR", title: "x" }), { status: 400 }),
    ]);
    const seen: unknown[] = [];
    const walk = async () => {
      for await (const item of checkslip.billing.orders.list()) seen.push(item);
    };
    await expect(walk()).rejects.toThrow("INVALID_CURSOR");
    expect(seen).toHaveLength(1);
  });
});
