/** Shape of every list response that pages with a cursor. */
export interface CursorPageBody<Item> {
  items: Item[];
  next_cursor: string | null;
}

type FetchPage<Item> = (cursor: string | undefined) => Promise<CursorPageBody<Item>>;

/**
 * One page of a cursor-paged list.
 *
 * Iterate it with `for await` to walk every item on this page and all pages
 * after it. Use {@link Page.getNextPage} to step one page at a time.
 */
export class Page<Item> implements AsyncIterable<Item> {
  /** Items on this page. */
  readonly items: Item[];
  /** Cursor for the next page, or `null` on the last page. */
  readonly nextCursor: string | null;

  /** @internal */
  constructor(
    private readonly fetchPage: FetchPage<Item>,
    body: CursorPageBody<Item>,
  ) {
    this.items = body.items;
    this.nextCursor = body.next_cursor ?? null;
  }

  /** True when another page follows this one. */
  hasNextPage(): boolean {
    return this.nextCursor !== null && this.nextCursor !== "";
  }

  /** Fetches the next page. Throws if this is the last page. */
  async getNextPage(): Promise<Page<Item>> {
    if (!this.hasNextPage()) throw new Error("No next page. Check hasNextPage() first.");
    const body = await this.fetchPage(this.nextCursor ?? undefined);
    return new Page(this.fetchPage, body);
  }

  /** Yields this page and every page after it. */
  async *pages(): AsyncGenerator<Page<Item>, void, undefined> {
    let page: Page<Item> = this;
    yield page;
    while (page.hasNextPage()) {
      page = await page.getNextPage();
      yield page;
    }
  }

  /** Yields every item from this page onward, fetching pages as needed. */
  async *[Symbol.asyncIterator](): AsyncIterator<Item> {
    for await (const page of this.pages()) {
      yield* page.items;
    }
  }
}

/**
 * What list methods return. Await it for the first {@link Page}, or iterate
 * it with `for await` to get every item across all pages.
 *
 * @example
 * ```ts
 * for await (const check of checkslip.slips.list({ outcome: ["FOUND"] })) {
 *   console.log(check.request_id);
 * }
 * ```
 */
export class PagePromise<Item> implements PromiseLike<Page<Item>>, AsyncIterable<Item> {
  private readonly first: Promise<Page<Item>>;

  /** @internal */
  constructor(fetchPage: FetchPage<Item>, initialCursor?: string) {
    this.first = fetchPage(initialCursor).then((body) => new Page(fetchPage, body));
    // Avoid an unhandled rejection when the caller only iterates.
    this.first.catch(() => {});
  }

  // biome-ignore lint/suspicious/noThenProperty: PagePromise is meant to be awaited.
  then<A = Page<Item>, B = never>(
    onfulfilled?: ((value: Page<Item>) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    return this.first.then(onfulfilled, onrejected);
  }

  /** Same as `Promise.prototype.catch`. */
  catch<B = never>(onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null): Promise<Page<Item> | B> {
    return this.first.catch(onrejected);
  }

  async *[Symbol.asyncIterator](): AsyncIterator<Item> {
    const page = await this.first;
    yield* page;
  }
}
