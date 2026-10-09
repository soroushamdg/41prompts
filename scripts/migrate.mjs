/* Applies drizzle/*.sql to the database. Reads .env (drizzle-kit and Node do
   not), uses the unpooled URL, and prints only the host.
     node scripts/migrate.mjs                    local / explicit
     node scripts/migrate.mjs --if-production    Vercel build: production only
     node scripts/migrate.mjs --url-env E2E_DATABASE_URL */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

try {
  process.loadEnvFile(".env");
} catch {
  /* env from the shell */
}

const args = process.argv.slice(2);
const onlyProd = args.includes("--if-production");
const urlEnv = args.includes("--url-env") ? args[args.indexOf("--url-env") + 1] : null;

if (onlyProd && process.env.VERCEL_ENV !== "production") {
  console.log("migrate: skipped (not a production build)");
  process.exit(0);
}

const url = urlEnv ? process.env[urlEnv] : process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  if (onlyProd) {
    console.log("migrate: skipped (no DATABASE_URL yet)");
    process.exit(0);
  }
  console.error(`migrate: ${urlEnv ?? "DATABASE_URL_UNPOOLED / DATABASE_URL"} is not set. See .env.example.`);
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 15_000 });
try {
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  console.log(`migrate: up to date on ${new URL(url).host}`);
} finally {
  await pool.end();
}
