import * as schema from "@41prompts/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { and, eq, gte, sql } from "drizzle-orm";
import { captureEvent, identifyUser } from "./analytics/posthog-server";
import { getDb } from "./db";
import { sessionCookiePrefix } from "./site/cookie-prefix";
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

/**
 * The session cookie's `Domain`, or `undefined` for host-only.
 *
 * Exported so the decision is testable without a database: `buildAuth` needs one, and "does this
 * deployment share its session across subdomains" is exactly the kind of thing that should not be
 * verifiable only by signing in on staging.
 */
export function sessionCookieConfig(): { enabled: true; domain: string } | undefined {
  const domain = process.env.SESSION_COOKIE_DOMAIN;
  if (domain === undefined || domain.length === 0) return undefined;
  return { enabled: true, domain };
}

function buildAuth() {
  const db = getDb();

  return betterAuth({
    baseURL: requireEnv("BETTER_AUTH_URL"),
    secret: requireEnv("BETTER_AUTH_SECRET"),
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
      usePlural: true,
    }),
    advanced: {
      // Per deployment, so production's wide-domain cookie cannot be mistaken for staging's.
      // `lib/site/cookie-prefix.ts` carries the failure this prevents; `proxy.ts` derives the same
      // value from the same function, because a gate looking for a different name than the one set
      // is the same outage wearing a different hat.
      cookiePrefix: sessionCookiePrefix(),
      /**
       * **The session cookie is scoped to the parent domain**, so a session created on `app.` is
       * visible to the apex — which is what lets the landing page show "Go to dashboard" instead of
       * "Sign in" without a second round trip or a flash of the wrong one.
       *
       * What this costs, stated plainly because it is a real widening: **every host under
       * `SESSION_COOKIE_DOMAIN` receives this cookie**, now and in future. Adding any subdomain
       * means adding something that can read a signed-in session. `infra/README.md` carries the same
       * warning next to the DNS records.
       *
       * What it does *not* cost, which was worth checking rather than assuming: Better Auth 1.7.2
       * prefixes this cookie `__Secure-`, never `__Host-` (`HOST_COOKIE_PREFIX` is defined in its
       * source and never applied). `__Secure-` permits a `Domain`, so the prefix stays, the cookie
       * name does not change, and `Secure`, `HttpOnly` and `SameSite=Lax` are all untouched. The
       * only attribute added is `Domain`.
       *
       * Unset — local development — leaves the cookie host-only, exactly as before.
       */
      crossSubDomainCookies: sessionCookieConfig(),
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
      user: {
        create: {
          // Fires once, on account creation — before the sign-in that immediately follows it
          // fires its own "login" below (decision 2's `signup` and `login` are deliberately
          // distinct events, both real for a brand-new user's first request).
          after: async (user) => {
            identifyUser(user.id);
            captureEvent(user.id, "signup");
          },
        },
      },
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
          // User id only, never the email (decision 3) — identify+capture happen here, not
          // client-side, so a sign-in is tracked even if the browser never runs any JS after.
          after: async (session) => {
            identifyUser(session.userId);
            captureEvent(session.userId, "login");
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
}

// Lazy, same reason as lib/db.ts: `next build` imports this module (directly for the [...all]
// route, transitively for every /app/* page) to collect route config, and the build container
// never has these env vars — they're Coolify runtime config, injected at container start.
// Confirmed by reproducing the build failure locally with them unset before making this lazy.
let cached: ReturnType<typeof buildAuth> | undefined;

export function getAuth(): ReturnType<typeof buildAuth> {
  if (!cached) {
    cached = buildAuth();
  }
  return cached;
}
