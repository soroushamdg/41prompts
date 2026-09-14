import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import {
  newApiKeyId,
  newBlokId,
  newDecompileId,
  newDecompileRunId,
  newProjectId,
  newPromptId,
  newVariableId,
  newRunBudgetId,
  newRunId,
  newWaitlistId,
} from "./ids";

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
/**
 * One row per decompile that actually ran. **This table is what GATE 1 reads.**
 *
 * M1's criterion — 300 unique decompiles in thirty days — was measured through PostHog until
 * 2026-09-12. Counting anonymous EU and Québec visitors by default, with a cookie and a stable id,
 * through a processor outside Canada, is not defensible under GDPR or Law 25, and a consent banner
 * would have made the number a measure of who accepts banners. So the measurement moved here:
 *
 * - **No cookie.** Nothing is written to the visitor's browser to make this count.
 * - **No third party.** The row never leaves our own Postgres, in Montréal.
 * - **No address.** The key is the same keyed hash `decompiles` uses — per-deployment salt, not
 *   reversible, and meaningless outside this deployment.
 * - **No content.** Two integers about the shape of the result, and nothing about what was in it.
 *
 * `bloks` and `findings` are here because EPIC-084 needs the blok-count distribution and this is the
 * only place it will ever exist; they are counts, not text.
 */
export const decompileRuns = pgTable("decompile_runs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => newDecompileRunId()),
  /** Null when the address was not knowable. Those rows still count toward totals, not uniques. */
  ipHash: text("ip_hash"),
  bloks: integer("bloks").notNull(),
  findings: integer("findings").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const waitlist = pgTable("waitlist", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => newWaitlistId()),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  unsubscribedAt: timestamp("unsubscribed_at"),
});

// ── EPIC-021a: projects, prompts, and the blok canvas ────────────────────────────────────────
//
// **The first tables that hold the only copy of something a person wrote.** Everything before this
// was derived from input the user still has: a decompile is a view of text they pasted and still
// have in their editor. From here the product is the copy, which changes what correct means — two
// rules run through every column below. Nothing silently discards typing, and every row is reachable
// only through its owner.

/**
 * One prompt, inside one project.
 *
 * `deletedAt` rather than a delete for the same reason `bloks` has one: a prompt is somebody's
 * writing, and a row that is gone cannot be given back.
 */
export const prompts = pgTable(
  "prompts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newPromptId()),
    project: text("project")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  // Every listing is "the prompts in this project", and ownership is resolved by joining through it.
  (table) => [index("prompts_project_idx").on(table.project)],
);

/**
 * One blok: a kind, some text a person wrote, and where it sits.
 *
 * ## `text` is stored byte for byte
 *
 * No trim, no CRLF conversion, no Unicode normalisation, no "tidying" of any kind. `CLAUDE.md` rule 3
 * says a blok stores the **verbatim** source span, and EPIC-013 learned what normalising costs: a
 * browser hands back CRLF from a `<textarea>` regardless of the author's editor, and every offset
 * downstream indexes the string the server actually received. Beyond the offsets, this is someone's
 * writing — trailing space in an example is sometimes the point.
 *
 * ## `rank`, and why it is a string
 *
 * A **fractional index**: a short base-62 key ordered lexicographically, so inserting between two
 * cards mints a key strictly between theirs and **reordering one card writes exactly one row**
 * (EPIC-021a decision 2 and its criterion). Integer positions would rewrite every row after the
 * moved one; a float runs out of precision after about fifty insertions in the same slot and then
 * silently stops ordering. `rank.ts` holds the mint, the rebalance and the reasoning.
 *
 * ## `editedText` and `editedFromHash` — the hand edit, and why it lives here
 *
 * **This pair is EPIC-021a decision 5's whole answer, and its placement is the answer.** A person can
 * take a span in the compiled pane and write it themselves (EPIC-021b builds that pane; this is where
 * what they write is kept). The risk the decision names is that adding a blok silently discards those
 * edits — the prompt recompiles, the text looks plausible, and their sentence is gone.
 *
 * EPIC-020's one-span-per-blok invariant means a hand edit belongs to exactly one blok, so it lives on
 * that blok's row. **Inserting a row into this table writes no other row**, which is what makes the
 * failure structurally impossible rather than a rule the insert path has to remember. A bug with
 * nowhere to live beats a test that catches it.
 *
 * `editedFromHash` is the blok's content hash at the moment of the edit, not now. It is what keeps
 * "the blok has changed since you edited this" answerable, which EPIC-020 established is a different
 * fact from "this text differs from the blok". Both null means the compiler owns this span.
 */
export const bloks = pgTable(
  "bloks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newBlokId()),
    prompt: text("prompt")
      .notNull()
      .references(() => prompts.id, { onDelete: "cascade" }),
    /**
     * One of `BLOK_KINDS` from `@41prompts/core`, validated at the boundary rather than by a database
     * constraint: ADR-003 forbids that word for a reason, and a `CHECK` would need a migration every
     * time the six move.
     */
    kind: text("kind").notNull(),
    text: text("text").notNull(),
    rank: text("rank").notNull(),
    editedText: text("edited_text"),
    editedFromHash: text("edited_from_hash"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    /** Decision 8's undo. A blok is someone's writing, so delete is a column and undo clears it. */
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    // The canvas reads "this prompt's bloks in rank order" on every render; the partial shape is not
    // expressed here because Drizzle's index builder has no partial support in this version, and the
    // `deletedAt` filter is selective enough at canvas sizes.
    index("bloks_prompt_rank_idx").on(table.prompt, table.rank),
  ],
);

/**
 * One variable a prompt declares: a name, a default, and a description. That is all of v1.
 *
 * ## Why rows and not a `jsonb` column on `prompts`
 *
 * Editing one variable's description writes one row. A JSON column would make every edit a
 * read-modify-write of the whole set, so two people editing two different variables would silently
 * overwrite each other — the same class of loss EPIC-021a decision 2 paid a fractional index to
 * avoid on the canvas. The set here is small enough that it would have worked most of the time,
 * which is the worst property a data model can have.
 *
 * ## There is no `optional` column
 *
 * A variable is optional exactly when it has a default to fall back on, so `optional` would be a
 * second field that can disagree with the first — optional with no default, required with one — and
 * then something has to decide which of the two is true. `isOptional()` in `@41prompts/core` asks
 * the question once, of `defaultValue`.
 *
 * ## `defaultValue` distinguishes null from empty
 *
 * `null` means the caller must supply it. `''` means they need not, and the value is the empty
 * string — which is a real answer for a variable like `{{extra_instructions}}`. A schema that
 * collapsed the two would make "optional, defaulting to nothing" unexpressible.
 */
export const promptVariables = pgTable(
  "prompt_variables",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newVariableId()),
    prompt: text("prompt")
      .notNull()
      .references(() => prompts.id, { onDelete: "cascade" }),
    /** Matches `[A-Za-z_][A-Za-z0-9_]*`, validated at the boundary by core's `isVariableName`. */
    name: text("name").notNull(),
    defaultValue: text("default_value"),
    description: text("description"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    // One declaration per name per prompt, enforced by the database rather than by every caller
    // remembering: a rename that collided would otherwise leave two rows and no way to say which
    // one a `{{name}}` in the text refers to.
    uniqueIndex("prompt_variables_prompt_name_idx").on(table.prompt, table.name),
  ],
);


// ── EPIC-031: the run engine ──────────────────────────────────────────────────────────────────

/**
 * One provider call, and everything `CLAUDE.md` rule 6 requires a run to store.
 *
 * > *Every run stores the raw provider payload (purged after 12 months), prompt hash, input hash,
 * > model, params, latency, cost.*
 *
 * ## What is here and what is deliberately not
 *
 * **Hashes, not copies.** `promptHash` and `inputHash` identify what was sent without storing a
 * second copy of it: the prompt already lives in `bloks` and the input in its input set, and a
 * second copy is a second thing to keep in step. A hash answers "was this the same request" exactly
 * as well, and it cannot drift.
 *
 * **`payload` is the provider's response, unedited.** `jsonb` rather than `text` so a later question
 * can be asked of it without reparsing every row. It is also **the privacy-sensitive column in the
 * table** — it is whatever a model said about whatever the user put in — which is what the clock is
 * for.
 *
 * **No API key, ever.** Not in a column, not in `params`, not in an error stored here. EPIC-004
 * decision 3 and `CLAUDE.md`'s server-access rules; a test asserts no stored payload contains a
 * key-shaped string.
 *
 * **`model` is the resolved, pinned id** — `claude-sonnet-5`, never a floating alias. A row that
 * records which alias was called cannot answer what actually ran, which makes the run
 * unreproducible and the cost unattributable.
 */
export const runs = pgTable(
  "runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newRunId()),
    owner: text("owner")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    prompt: text("prompt")
      .notNull()
      .references(() => prompts.id, { onDelete: "cascade" }),

    /** Rule 6, verbatim: the raw provider payload. */
    payload: jsonb("payload").notNull(),
    /** Rule 6: the compiled prompt's content hash, not the compiled prompt. */
    promptHash: text("prompt_hash").notNull(),
    /** Rule 6: the input row's hash, not the input. */
    inputHash: text("input_hash").notNull(),
    /** Rule 6: what was actually called, resolved and pinned. */
    model: text("model").notNull(),
    /** Rule 6: what was sent — temperature, max tokens — as sent rather than as configured. */
    params: jsonb("params").notNull(),
    /** Rule 6: wall clock around the provider call only, not around the job. */
    latencyMs: integer("latency_ms").notNull(),
    /**
     * Rule 6: cost, in the same integer cents `run_budgets` already uses.
     *
     * **Nullable, and null is not zero.** A model absent from the dated price table has an unknown
     * cost, and recording zero would silently spend nothing against a budget whose entire job is to
     * stop spending. Null says "we do not know", which is a thing a reconciliation can act on.
     */
    costCents: integer("cost_cents"),

    /**
     * When this row's payload may be deleted.
     *
     * **Written at insert, not derived at read**, and that is the whole design decision in this
     * column. A `created_at < now() - interval` query would retroactively re-date every existing row
     * the moment the retention window changed — so a row written under a twelve-month promise would
     * silently acquire whatever the new promise is. A stored date keeps the promise each row was
     * written under, which is the direction a promise is supposed to travel.
     */
    purgeAfter: timestamp("purge_after").notNull(),

    /** `sha(compiled + input + model + params)`. A hit returns the stored result and calls nobody. */
    cacheKey: text("cache_key").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow()
  },
  (table) => [
    // The purge sweep's only query, and the overdue count's. Without it both degrade into a full
    // scan of the largest table in the product, on a schedule, forever.
    index("runs_purge_after_idx").on(table.purgeAfter),
    // One cached answer per owner per identical request. Scoped to the owner on purpose: a cache
    // shared across accounts would let one user's spend answer another user's question, and read
    // one account's model output into another's results.
    uniqueIndex("runs_owner_cache_key_idx").on(table.owner, table.cacheKey)
  ]
);
