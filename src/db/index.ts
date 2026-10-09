import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "./schema";

/* One pg Pool per server instance (Neon's pooled URL in production). The
   pool connects lazily, so importing this module never needs a database;
   tooling like the Better Auth CLI can load it with no .env. */

const g = globalThis as unknown as { __41pPool?: Pool };

export const pool =
  g.__41pPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_MAX || 5),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
if (process.env.NODE_ENV !== "production") g.__41pPool = pool;
attachDatabasePool(pool);

export const db = drizzle(pool, { schema, casing: "snake_case" });

/** Any Postgres-flavoured Drizzle database with our schema: node-postgres in
    the app, in-process PGlite in Vitest. Repositories take this. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, typeof schema>;
