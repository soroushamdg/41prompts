import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import pg from "pg";

/* Before the suite: migrate the Neon e2e branch, empty every table, and clear
   the mail outbox. The e2e branch is never the dev or production database. */
export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL is not set. The suite needs its own Neon branch; see .env.example.");
  if (url === process.env.DATABASE_URL) throw new Error("E2E_DATABASE_URL must not be the dev database: the suite truncates it.");
  execFileSync("node", ["scripts/migrate.mjs", "--url-env", "E2E_DATABASE_URL"], { stdio: "inherit" });
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public' and tablename not like '__drizzle%'");
    if (rows.length) await client.query(`truncate ${rows.map((r) => `"${r.tablename}"`).join(", ")} restart identity cascade`);
  } finally {
    await client.end();
  }
  rmSync(".e2e/outbox.jsonl", { force: true });
}
