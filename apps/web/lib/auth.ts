import * as schema from "@41prompts/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "./db";
import { sendMagicLinkEmail } from "./email";

const MAGIC_LINK_EXPIRES_IN_SECONDS = 15 * 60;
const MAGIC_LINK_IP_RATE_LIMIT = { window: 5 * 60, max: 15 };
const MAGIC_LINK_EMAIL_RATE_LIMIT_WINDOW_MINUTES = 15;
const MAGIC_LINK_EMAIL_RATE_LIMIT_MAX = 3;
const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 30;
const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export const auth = betterAuth({
  baseURL: requireEnv("BETTER_AUTH_URL"),
  secret: requireEnv("BETTER_AUTH_SECRET"),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    usePlural: true,
  }),
  advanced: {
    cookiePrefix: "41prompts",
  },
  session: {
    expiresIn: SESSION_EXPIRES_IN_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS,
  },
  rateLimit: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: requireEnv("GOOGLE_CLIENT_ID"),
      clientSecret: requireEnv("GOOGLE_CLIENT_SECRET"),
    },
    github: {
      clientId: requireEnv("GITHUB_CLIENT_ID"),
      clientSecret: requireEnv("GITHUB_CLIENT_SECRET"),
    },
  },
  plugins: [
    magicLink({
      expiresIn: MAGIC_LINK_EXPIRES_IN_SECONDS,
      rateLimit: MAGIC_LINK_IP_RATE_LIMIT,
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail(email, url);
      },
    }),
    // Must be last: it hooks every response to relay Set-Cookie through next/headers'
    // cookies() API, which is the only way a cookie set inside a Server Action (sign-out,
    // account delete) actually reaches the browser — a route handler's own Response headers
    // don't need it (the magic-link verify redirect works without this), but auth.api calls
    // made from a "use server" action do.
    nextCookies(),
  ],
  // Blocks the *next* sign-in for an already soft-deleted user (decision 5's "refuses
  // re-sign-in"), across every method (magic link, Google, GitHub) — this hook is the one
  // Better Auth documents for gating a *returning* identity, since `user.validateUserInfo`
  // only re-runs on create-user/link-account/oauth-sign-in, not on a plain returning sign-in.
  // The immediate half of decision 5 (set deletedAt, kill the current session) happens in the
  // account-delete server action, not here.
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const [user] = await db
            .select({ deletedAt: schema.users.deletedAt })
            .from(schema.users)
            .where(eq(schema.users.id, session.userId));
          if (user?.deletedAt) {
            return false;
          }
        },
      },
    },
  },
  hooks: {
    // Better Auth's own rate limiter (configured on the magic-link plugin above) is IP+path
    // keyed, not identity-keyed, so it can't throttle "many requests for one victim's email
    // from many IPs" on its own (decision 9's "per email" half). This hook adds that check
    // by counting recent `verifications` rows for the requested email directly.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/magic-link") {
        return;
      }
      const email = (ctx.body as { email?: string } | undefined)?.email;
      if (!email) {
        return;
      }

      const since = new Date(Date.now() - MAGIC_LINK_EMAIL_RATE_LIMIT_WINDOW_MINUTES * 60_000);
      const recent = await db
        .select({ id: schema.verifications.id })
        .from(schema.verifications)
        .where(
          and(
            gte(schema.verifications.createdAt, since),
            sql`(${schema.verifications.value}::jsonb ->> 'email') = ${email}`,
          ),
        );

      if (recent.length >= MAGIC_LINK_EMAIL_RATE_LIMIT_MAX) {
        throw new APIError("TOO_MANY_REQUESTS", {
          message: "Too many sign-in links requested for this email. Try again later.",
        });
      }
    }),
  },
});
