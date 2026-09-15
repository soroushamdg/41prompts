/**
 * How the example is named wherever it appears, so it is never mistaken for the person's writing.
 *
 * Called `naming.ts`, not `labels.ts`: ADR-003 forbids that word in identifiers and file names
 * alike, and `pnpm forbidden-words` reads both. Its own module because `example.ts` is imported by
 * a `"use server"` file, and a server-actions
 * module may export nothing but async functions — the same constraint that gave `slugify` a home of
 * its own.
 */
export const EXAMPLE_NAME = "Example";
