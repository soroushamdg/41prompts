import { randomBytes } from "node:crypto";

/**
 * Carrying a pasted prompt from the landing page's ask bar to `/decompile`.
 *
 * The ask bar has to land the reader on `/decompile` with their text intact, and `MAX_INPUT_BYTES`
 * is 100 KB, which rules out every obvious transport:
 *
 * - **A query string** (`/decompile?prompt=…`) puts the prompt in browser history, in the `Referer`
 *   of any outbound click, in proxy access logs and — once EPIC-015 wires PostHog — in analytics. A
 *   page whose own copy says nothing is stored must not put the prompt in a URL. It also breaks past
 *   roughly 8 KB.
 * - **A cookie** is 4 KB, and rides on every subsequent request.
 * - **Posting to the page** is not a thing: an App Router page cannot read a request body, and a
 *   `route.ts` cannot share a path with a `page.tsx`.
 * - **A row in `decompiles`** is storage, and there is none on this path.
 *
 * So: the text stays on the server and only an opaque id travels. One use, sixty seconds, in memory.
 *
 * **This is per process.** With a second web container the redirect can land somewhere that never saw
 * the id — the same seam as EPIC-014's in-memory rate limiter, and the same fix when either needs
 * one. A miss is not an error: `/decompile` renders its ordinary empty state and the reader pastes
 * again, which is why `take` returns `null` rather than throwing.
 */

/** Long enough that guessing one inside its sixty seconds is not a thing worth modelling. */
const ID_BYTES = 16;

/** Long enough to survive a redirect and a cold render, short enough that nothing lingers. */
export const HANDOFF_TTL_MS = 60_000;

/**
 * A ceiling on entries, not on bytes, and deliberately small.
 *
 * Each entry can be 100 KB, so an unbounded map is a memory exhaustion primitive: a caller who posts
 * the ask bar and never follows the redirect leaves an entry behind for its full TTL. 64 × 100 KB is
 * a bounded 6.4 MB worst case, and the rate limit on `/decompile` is what makes reaching even that
 * expensive.
 */
const MAX_ENTRIES = 64;

interface Entry {
  readonly text: string;
  readonly expiresAt: number;
}

const store = new Map<string, Entry>();

function sweep(now: number): void {
  for (const [id, entry] of store) {
    if (entry.expiresAt <= now) store.delete(id);
  }
}

/** Hand a prompt over. Returns the id to put in the redirect. */
export function put(text: string, now: number = Date.now()): string {
  sweep(now);

  // Map preserves insertion order, so the first key is the oldest. Dropping it beats refusing the
  // newest: the reader in front of us is the one whose paste matters.
  while (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next();
    if (oldest.done === true) break;
    store.delete(oldest.value);
  }

  const id = randomBytes(ID_BYTES).toString("hex");
  store.set(id, { text, expiresAt: now + HANDOFF_TTL_MS });
  return id;
}

/**
 * Take it back, once.
 *
 * Deleting on read is what keeps a `/decompile?start=…` URL from being a working link to somebody
 * else's prompt if it is shared, bookmarked or sitting in a history list.
 */
export function take(id: string | null | undefined, now: number = Date.now()): string | null {
  if (typeof id !== "string" || id.length === 0) return null;
  sweep(now);
  const entry = store.get(id);
  if (entry === undefined) return null;
  store.delete(id);
  return entry.text;
}

/** Tests only. */
export function resetHandoffForTest(): void {
  store.clear();
}

/** Tests only. */
export function handoffSizeForTest(): number {
  return store.size;
}
