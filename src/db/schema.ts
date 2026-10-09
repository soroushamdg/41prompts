import { sql } from "drizzle-orm";
import { bigint, boolean, check, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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

/** Non-secret settings of a model connection (see src/lib/catalog.ts). */
export type ConnectionSettings = {
  baseURL?: string;
  organization?: string;
  project?: string;
  resourceName?: string;
  apiVersion?: string;
  region?: string;
  authMode?: "apiKey" | "accessKeys";
  includeUsage?: boolean;
  /** A browser model whose key is kept in the user's browser. */
  localKey?: boolean;
};

/** A model the user brought (M07): one model, its credentials, where it runs.
    The secret is one AES-256-GCM sealed JSON blob; browser rows never hold one
    (their optional key stays in that browser). */
export const modelConnections = pgTable(
  "model_connections",
  {
    id: uuid().primaryKey(),
    userId: text().notNull().references(() => user.id, { onDelete: "cascade" }),
    label: text().notNull(),
    provider: text().notNull(),
    runsIn: text({ enum: ["server", "browser"] }).notNull(),
    modelId: text().notNull(),
    settings: jsonb().$type<ConnectionSettings>().notNull().default({}),
    ciphertext: text(),
    iv: text(),
    authTag: text(),
    keyVersion: integer(),
    secretHint: text(),
    inputPerMtok: doublePrecision(),
    outputPerMtok: doublePrecision(),
    priceSource: text({ enum: ["provider", "catalog", "openrouter", "user", "local"] }),
    priceAt: timestamp({ withTimezone: true }),
    lastTestAt: timestamp({ withTimezone: true }),
    lastTestOk: boolean(),
    lastTestMs: integer(),
    lastTestMessage: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("model_connections_user_label_idx").on(t.userId, sql`lower(${t.label})`),
    index("model_connections_user_created_idx").on(t.userId, t.createdAt),
    check("model_connections_browser_no_secret", sql`${t.runsIn} = 'server' or ${t.ciphertext} is null`),
    check(
      "model_connections_sealed_complete",
      sql`(${t.ciphertext} is null) = (${t.iv} is null) and (${t.iv} is null) = (${t.authTag} is null) and (${t.authTag} is null) = (${t.keyVersion} is null)`,
    ),
    check("model_connections_prices", sql`coalesce(${t.inputPerMtok}, 0) >= 0 and coalesce(${t.outputPerMtok}, 0) >= 0`),
  ],
);

/** "Tell me when it opens" on the upgrade sheet, one row per user. */
export const performanceInterest = pgTable("performance_interest", {
  userId: text().primaryKey().references(() => user.id, { onDelete: "cascade" }),
  feature: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** The in-app Product Hunt review prompt: one row per user once asked. */
export const reviewPrompts = pgTable("review_prompts", {
  userId: text().primaryKey().references(() => user.id, { onDelete: "cascade" }),
  status: text({ enum: ["open", "snoozed", "never", "reviewed"] }).notNull().default("open"),
  snoozedUntil: timestamp({ withTimezone: true }),
  askCount: integer().notNull().default(0),
  lastStage: text(),
  lastAskedAt: timestamp({ withTimezone: true }),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Stripe webhook idempotency. */
export const stripeEvents = pgTable("stripe_events", {
  id: text().primaryKey(),
  type: text().notNull(),
  receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
