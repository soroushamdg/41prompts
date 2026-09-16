/**
 * The `fetch` an AI SDK provider factory accepts.
 *
 * **It exists for the wiring tests and for nothing else.** Each adapter takes an optional one so a
 * test can assert which URL a provider is actually called at and that the key travelled in a
 * header — a provider constructed against the wrong endpoint answers every logic test correctly and
 * fails in production, which is precisely the gap the injectable `generate` in `ai-sdk.ts` does not
 * cover.
 *
 * Typed as the SDK types it — the global `fetch` — rather than narrowed, because narrowing it would
 * mean a test double that satisfies this type and not the SDK's.
 */
export type FetchLike = typeof globalThis.fetch;
