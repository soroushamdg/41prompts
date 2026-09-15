import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export function createDb(connectionString: string) {
  return drizzle(connectionString, { schema });
}

export type Db = ReturnType<typeof createDb>;

/**
 * A transaction handle, as the callback of `db.transaction` receives it.
 *
 * Named because `Db` and a transaction are **not** the same type — a transaction has no `$client` —
 * so a helper typed `Db` cannot be handed a `tx`, and the alternative was to inline every write
 * that needs to be atomic. EPIC-034 needed five writes in one transaction, three of which already
 * had well-tested helpers; copying them inline to satisfy a type would have meant two versions of
 * "how a blok is inserted", which is the failure `addBlok` exists to prevent.
 */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Either one. Every write helper in this package takes this rather than `Db`, so the same function
 * is correct inside a transaction and outside one, and no caller has to choose between atomicity
 * and reuse.
 */
export type DbOrTx = Db | Tx;
