import { defineConfig } from "drizzle-kit";

/* drizzle-kit does not read .env by itself (on this machine a stray default
   once pointed migrations at another project's database), so load it here
   and refuse to run without an explicit URL. Migrations use the unpooled URL. */
try {
  process.loadEnvFile(".env");
} catch {
  /* env comes from the shell (Vercel build, CI) */
}

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  casing: "snake_case",
  strict: true,
  verbose: true,
  dbCredentials: { url: url ?? "postgres://missing-database-url.invalid/none" },
});
