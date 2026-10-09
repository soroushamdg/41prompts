import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { Blok } from "@/lib/bloks";

/* Column names are snake_case in the database (drizzle `casing`).

   ---- Better Auth ----------------------------------------------------------
   Matches what `auth generate` emits for better-auth 1.7. The extra columns on
   `user` (plan, Stripe, sheet counter) are deliberately NOT declared to Better
   Auth, so no client call can write them; only our server code does. */

export const user = pgTable("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  // ---- 41prompts (server-only) ----
  plan: text({ enum: ["free", "performance"] }).notNull().default("free"),
  stripeCustomerId: text().unique(),
  stripeSubscriptionId: text(),
  subscriptionStatus: text(),
  currentPeriodEnd: timestamp({ withTimezone: true }),
  nextSheetNumber: integer().notNull().default(1),
});

export const session = pgTable(
  "session",
  {
    id: text().primaryKey(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    token: text().notNull().unique(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
    ipAddress: text(),
    userAgent: text(),
    userId: text().notNull().references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text().notNull().references(() => user.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const rateLimit = pgTable("rate_limit", {
  id: text().primaryKey(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  lastRequest: bigint({ mode: "number" }).notNull(),
});

/* ---- 41prompts ------------------------------------------------------------ */

export const prompts = pgTable(
  "prompts",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text().notNull().references(() => user.id, { onDelete: "cascade" }),
    /** The prompt's name, slugified; also its URL (/p/:slug). */
    slug: text().notNull(),
    /** "Sheet 07": the user's nth prompt, never reused. */
    sheetNumber: integer().notNull(),
    headVersion: integer().notNull().default(0),
    bloksCount: integer().notNull().default(0),
    /** First line of the first blok, for the library subtitle. */
    description: text().notNull().default(""),
    /** Monotonic, so blok IDs are never reused after a delete or restore. */
    nextBlokId: integer().notNull().default(1),
    /** Values for {{variables}} (Filled view and runs). Not versioned. */
    fillValues: jsonb().$type<Record<string, string>>().notNull().default({}),
    archivedAt: timestamp({ withTimezone: true }),
    deletedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("prompts_user_slug_live_idx").on(t.userId, t.slug).where(sql`${t.deletedAt} is null`),
    index("prompts_user_updated_idx").on(t.userId, t.updatedAt),
    index("prompts_deleted_idx").on(t.deletedAt),
  ],
);

/** Immutable: rows are only inserted. `name` is the one column that changes. */
export const promptVersions = pgTable(
  "prompt_versions",
  {
    id: uuid().primaryKey().defaultRandom(),
    promptId: uuid().notNull().references(() => prompts.id, { onDelete: "cascade" }),
    number: integer().notNull(),
    bloks: jsonb().$type<Blok[]>().notNull(),
    contentHash: text().notNull(),
    clientSaveId: text(),
    note: text().notNull(),
    name: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("prompt_versions_number_idx").on(t.promptId, t.number),
    uniqueIndex("prompt_versions_save_idx").on(t.promptId, t.clientSaveId),
    check("prompt_versions_number_positive", sql`${t.number} > 0`),
  ],
);

export const PROVIDERS = ["openai", "anthropic", "google"] as const;
export type Provider = (typeof PROVIDERS)[number];

/** API keys, AES-256-GCM encrypted with AAD = userId|provider. */
export const modelKeys = pgTable(
  "model_keys",
  {
    userId: text().notNull().references(() => user.id, { onDelete: "cascade" }),
    provider: text({ enum: PROVIDERS }).notNull(),
    ciphertext: text().notNull(),
    iv: text().notNull(),
    authTag: text().notNull(),
    keyVersion: integer().notNull().default(1),
    last4: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.provider] })],
);

/** "Tell me when it opens" on the upgrade sheet, one row per user. */
export const performanceInterest = pgTable("performance_interest", {
  userId: text().primaryKey().references(() => user.id, { onDelete: "cascade" }),
  feature: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Stripe webhook idempotency. */
export const stripeEvents = pgTable("stripe_events", {
  id: text().primaryKey(),
  type: text().notNull(),
  receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
