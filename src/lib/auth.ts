import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins/magic-link";
import { db as appDb, type Db } from "@/db";
import * as schema from "@/db/schema";
import { isE2E } from "@/lib/env";
import { APP_URL } from "@/lib/hosts";
import { sendMail, signInMail } from "@/server/mail";

/* Better Auth: email magic link (Resend), Google and GitHub. One form signs
   people in and up. Sessions live in Postgres for 30 days, refreshed daily.
   The auth cookie is host-only on the app host. Plan and Stripe columns on
   `user` are not declared here, so no client call can change them. */

type SocialProviders = NonNullable<Parameters<typeof betterAuth>[0]["socialProviders"]>;

function socialProviders(): SocialProviders {
  const social: SocialProviders = {};
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    social.google = { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, prompt: "select_account" };
  }
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    social.github = { clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET };
  }
  return social;
}

/** Which OAuth buttons can work in this deployment. */
export function enabledProviders(): Array<"google" | "github"> {
  return Object.keys(socialProviders()) as Array<"google" | "github">;
}

/** Keeps only same-origin relative paths, so a link can never send someone elsewhere. */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

type AuthDeps = {
  db: Db;
  /** Delivers the sign-in link (Resend, the e2e outbox, or a test spy). */
  sendLink: (email: string, link: string) => Promise<void>;
};

/** Builds the auth instance. Tests pass an in-process database and a spy. */
export function createAuth({ db, sendLink }: AuthDeps) {
  return betterAuth({
    appName: "41prompts",
    baseURL: APP_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: [APP_URL],
    database: drizzleAdapter(db, { provider: "pg", schema }),
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    account: {
      accountLinking: { enabled: true, trustedProviders: ["google", "github"] },
    },
    socialProviders: socialProviders(),
    rateLimit: {
      enabled: !isE2E() && process.env.NODE_ENV === "production",
      storage: "database",
      window: 60,
      max: 100,
    },
    advanced: {
      useSecureCookies: APP_URL.startsWith("https://"),
    },
    telemetry: { enabled: false },
    plugins: [
      magicLink({
        expiresIn: 60 * 15,
        storeToken: "hashed",
        rateLimit: { window: 60, max: 5 },
        sendMagicLink: async ({ email, url }) => {
          // The emailed link opens an interstitial page with a Continue button,
          // so link scanners that prefetch URLs never burn the single-use token.
          const verify = new URL(url);
          const link = new URL("/sign-in/verify", APP_URL);
          for (const k of ["token", "callbackURL", "newUserCallbackURL", "errorCallbackURL"]) {
            const v = verify.searchParams.get(k);
            if (v) link.searchParams.set(k, v);
          }
          await sendLink(email, link.toString());
        },
      }),
      nextCookies(),
    ],
  });
}

export const auth = createAuth({
  db: appDb,
  sendLink: (email, link) => sendMail(signInMail(email, link)),
});

export type Session = typeof auth.$Infer.Session;
