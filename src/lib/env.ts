import { z } from "zod";

/* Environment access. Values are read lazily so that tooling (the Better Auth
   CLI, drizzle-kit, Vitest) can import modules without a full .env. Every
   variable is described in .env.example. */

const serverSchema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_URL_UNPOOLED: z.string().url().optional(),
  BETTER_AUTH_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(3),
  KEYS_ENCRYPTION_KEY: z.string().refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes, base64"),
  CRON_SECRET: z.string().min(16),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_ID: z.string().optional(),
});

export type ServerEnvName = keyof z.infer<typeof serverSchema> | "E2E_DATABASE_URL" | "SENTRY_AUTH_TOKEN";

/** Reads one server variable or throws a message that names it. */
export function requireEnv(name: ServerEnvName): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. See .env.example.`);
  return v;
}

export function optionalEnv(name: ServerEnvName): string | undefined {
  return process.env[name] || undefined;
}

/** Pricing and the upgrade path are hidden until this is turned on. Inlined at build time. */
export const PRICING_ENABLED = process.env.NEXT_PUBLIC_PRICING_ENABLED === "true";

export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "";

/** Test-only switches (mock model, file mail outbox, no rate limit). Never in production. */
export function isE2E(): boolean {
  const on = process.env.E2E_MODE === "1";
  if (on && process.env.VERCEL_ENV === "production") throw new Error("E2E_MODE must never be set in production.");
  return on;
}

/** Called once at server start. Fails a production deployment that is missing
    configuration; elsewhere it only warns, so local work can start small. */
export function assertServerEnv() {
  isE2E();
  const result = serverSchema.safeParse(process.env);
  const problems = result.success ? [] : result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  if (PRICING_ENABLED) {
    for (const k of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_ID"] as const) {
      if (!process.env[k]) problems.push(`${k}: required while NEXT_PUBLIC_PRICING_ENABLED=true`);
    }
  }
  if (!problems.length) return;
  const msg = `Environment is incomplete:\n  ${problems.join("\n  ")}`;
  const maintenance = process.env.MAINTENANCE_MODE !== "0" && process.env.MAINTENANCE_MODE !== "false";
  if (process.env.VERCEL_ENV === "production" && !maintenance) throw new Error(msg);
  console.warn(msg);
}
