import { boolean, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { newApiKeyId, newDecompileId, newProjectId, newRunBudgetId, newWaitlistId } from "./ids";

// Better Auth's own tables. Column keys match Better Auth's internal field names exactly
// (required for the Drizzle adapter to bind); SQL column names are snake_case per CLAUDE.md.
// Ids keep Better Auth's own generated shape (EPIC-002 decision 4) — no default here, Better
// Auth supplies the value on insert through the adapter.

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  // Soft delete (decision 5): set immediately on account-delete request, read by the
  // session-create hook to refuse sign-in, and by the worker's purge job.
  deletedAt: timestamp("deleted_at"),
  // EPIC-004 decision 6's substrate for "per-plan defaults" — there is no billing integration
  // yet (EPIC-070), just a plain string a new `run_budgets` row's default cap is looked up
  // against in `plan_budget_defaults`. Every account defaults to "free" until Stripe exists.
  plan: text("plan").notNull().default("free"),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    issuer: text("issuer").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("accounts_issuer_account_id_idx").on(table.issuer, table.accountId)],
);

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Our own tables (decision 4). Prefixed ids per CLAUDE.md.

export const projects = pgTable("projects", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => newProjectId()),
  owner: text("owner")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const apiKeys = pgTable("api_keys", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => newApiKeyId()),
  project: text("project")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  hashedKey: text("hashed_key").notNull(),
  lastFour: text("last_four").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
});

// EPIC-004 decision 6: "no user can run up an unbounded provider bill" and "the cap is a number
// in the database, not a constant in code." This table is that number's home — a new
// `run_budgets` row is seeded from the caller's plan at creation time, but the cap actually
// enforced on every increment (`apps/worker/src/budgets/increment-run-budget.ts`) always comes
// from `run_budgets.capCents`, never from this table or a code constant, directly. Seed values
// (below, in the generated migration) are placeholders — EPIC-070 owns the real pricing numbers.
export const planBudgetDefaults = pgTable("plan_budget_defaults", {
  plan: text("plan").primaryKey(),
  monthlyCapCents: integer("monthly_cap_cents").notNull(),
});

// Empty of provider integration on purpose (EPIC-031 wires the actual `amountCents` from a real
// provider call; this epic only builds the table, the cap enforcement, and its tests). One row
// per owner — `unique()` is what makes the worker's "get or create" step race-safe via
// `ON CONFLICT (owner) DO NOTHING`.
export const runBudgets = pgTable("run_budgets", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => newRunBudgetId()),
  owner: text("owner")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  capCents: integer("cap_cents").notNull(),
  spentCents: integer("spent_cents").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── EPIC-014: capture ────────────────────────────────────────────────────────────────────────

/**
 * A shared decompile. Anonymous, unguessable by id, and purged after 30 days.
 *
 * **`source` is stored exactly as the server received it, CRLF and all.** EPIC-013 measured that a
 * browser normalises a `<textarea>`'s value to CRLF on submit regardless of the author's editor, and
 * the byte offsets a decompile produces index the string the server actually got. Normalising on the
 * way in — "tidying" the line endings — would shift every range in every stored link by one
 * character per preceding line. Whatever is in this column is what the ranges were computed against.
 *
 * **No `user_id`.** This route has no accounts (decision 9) and adding a nullable owner now would
 * invite a later feature to read it.
 */
export const decompiles = pgTable("decompiles", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => newDecompileId()),
  source: text("source").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  /**
   * The submitting address, hashed with a per-deployment salt — never the address itself.
   *
   * It exists for abuse accounting, which needs only "same or different", and a hash answers that.
   * Storing the address would make this table a list of who read what, which is a liability we would
   * be keeping on behalf of people who never signed up for anything.
   */
  ipHash: text("ip_hash"),
  userAgentHash: text("user_agent_hash"),
});

/**
 * "Tell me when the editor ships." One field, no account, no marketing automation (decision 8).
 *
 * `unsubscribedAt` rather than a delete: somebody who unsubscribes should stay unsubscribed if they
 * later land on the form again, and a deleted row cannot remember that.
 */
export const waitlist = pgTable("waitlist", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => newWaitlistId()),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  unsubscribedAt: timestamp("unsubscribed_at"),
});
