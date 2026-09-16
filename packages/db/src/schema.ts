import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import {
  newApiKeyId,
  newBlokId,
  newDecompileId,
  newDecompileRunId,
  newInputSetId,
  newProjectId,
  newPromptId,
  newPromptVersionId,
  newProviderKeyId,
  newSuiteCheckId,
  newSuiteResultId,
  newSuiteRunId,
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

// ── EPIC-032: input sets, triggered runs, and the results that are kept ───────────────────────

/**
 * One uploaded CSV, per prompt, owner-scoped by joining through `prompts → projects.owner`.
 *
 * ## The columns are the variable bindings
 *
 * EPIC-032 decision 1. `columns` is the header **in file order**, and each entry of `rows` is that
 * many values in the same order. A header that names a column no variable matches, or omits a
 * required variable, is refused **at upload** — so a set that exists here is one that binds.
 *
 * ## Rows live here, as `jsonb`, rather than in a table of their own
 *
 * Manual rows are out of scope, so a row is never edited after upload and the read is always "the
 * whole set". The upload cap keeps it small. A per-row table would buy nothing and cost a join on
 * the path every run takes.
 *
 * ## `deletedAt`, not a delete
 *
 * A removed set is still what some run in the history ran against, and a row that is gone cannot
 * answer "what was input 7". The same reasoning `bloks.deletedAt` records, arriving from the side
 * of a result rather than of somebody's writing.
 */
export const inputSets = pgTable(
  "input_sets",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newInputSetId()),
    prompt: text("prompt")
      .notNull()
      .references(() => prompts.id, { onDelete: "cascade" }),
    /** What the person called it — the file's own name, as uploaded. */
    name: text("name").notNull(),
    /** The header, in file order. `string[]`. */
    columns: jsonb("columns").notNull(),
    /** One entry per record, each `columns.length` values in the same order. `string[][]`. */
    rows: jsonb("rows").notNull(),
    /** Stored so a listing does not have to read the rows blob to say how many there are. */
    rowCount: integer("row_count").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [index("input_sets_prompt_idx").on(table.prompt)],
);

/**
 * One triggered run: one input set, one model, one moment.
 *
 * It **groups** the `runs` rows EPIC-031 already writes — one per input — rather than replacing
 * them: rule 6's record of a provider call stays exactly where it was, and this is the thing a
 * person opens.
 *
 * ## The counters are updated as the run goes, not at the end
 *
 * `completedInputs`, `calls`, `cachedCalls` and `costCents` are written after each input, because
 * the page polls them. A run that only reports itself when finished is a spinner.
 *
 * ## `state` and `refusalReason` are two facts, not one
 *
 * A run that was refused before anything ran is `refused`. A run that ran and then hit the budget
 * cap is `done` **with** a reason recorded — EPIC-031 decision 6 keeps what already ran, so calling
 * it refused would throw away a true thing about the work that happened. The surface says both.
 */
export const suiteRuns = pgTable(
  "suite_runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newSuiteRunId()),
    owner: text("owner")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    prompt: text("prompt")
      .notNull()
      .references(() => prompts.id, { onDelete: "cascade" }),
    inputSet: text("input_set")
      .notNull()
      .references(() => inputSets.id, { onDelete: "cascade" }),
    /** Resolved and pinned, like `runs.model`. */
    model: text("model").notNull(),
    params: jsonb("params").notNull(),
    /** The compiled prompt's content hash at trigger time, so "what ran" stays answerable. */
    promptHash: text("prompt_hash").notNull(),
    /**
     * The compiled prompt itself, frozen at trigger time.
     *
     * **A deliberate exception to `runs`'s "hashes, not copies".** There the hash is enough because
     * the prompt still lives in `bloks` and nothing is sent from the row. Here the row *is* what
     * gets sent: every input is bound into this text, one input at a time, over however long the
     * run takes. Recompiling per input would mean an edit made mid-run silently changes what the
     * later inputs receive — so input 1 and input 40 would be answering different prompts and the
     * results would be compared as though they were not.
     */
    promptText: text("prompt_text").notNull(),
    /** `queued` · `running` · `done` · `refused`. */
    state: text("state").notNull().default("queued"),
    /** One of `apps/worker`'s `RefusalReason` values. Null when nothing was refused. */
    refusalReason: text("refusal_reason"),
    totalInputs: integer("total_inputs").notNull(),
    completedInputs: integer("completed_inputs").notNull().default(0),
    /** Provider calls actually made. A cache hit is not one. */
    calls: integer("calls").notNull().default(0),
    /** Inputs answered from the cache, which called nobody and cost nothing. */
    cachedCalls: integer("cached_calls").notNull().default(0),
    /** Spend **on this run**, in the same integer cents `run_budgets` uses. */
    costCents: integer("cost_cents").notNull().default(0),
    /**
     * The judge's calls and the judge's spend, counted **separately** (EPIC-033 decision 4).
     *
     * Not folded into `calls` and `costCents`, because they answer different questions: what it cost
     * to run a prompt, and what it cost to check it. A person deciding whether checking is worth the
     * money cannot do so from one number that contains both.
     */
    judgeCalls: integer("judge_calls").notNull().default(0),
    judgeCachedCalls: integer("judge_cached_calls").notNull().default(0),
    judgeCostCents: integer("judge_cost_cents").notNull().default(0),
    /**
     * When the `run_passed` analytics event was sent for this run, or null (EPIC-034).
     *
     * **The one thing about the activation journey that is stored rather than derived**, and the
     * exception proves decision 4 rather than bending it: every *step* of the journey is a question
     * about rows that already exist, but "we have already told PostHog about this" is a fact with no
     * other home. Without it the event fires on every render of a passing run, and a metric that
     * counts page views as activations is worse than no metric.
     *
     * Claimed by a conditional UPDATE (`claimPassedNotification`), so two renders racing — two tabs,
     * two web containers — produce exactly one event between them.
     */
    passedNotifiedAt: timestamp("passed_notified_at"),
    /**
     * The version this run was triggered against (EPIC-040), pinned at that moment.
     *
     * **Nullable, and it stays nullable.** Every run that existed before EPIC-040 has no version and
     * must keep working; backfilling one would be inventing a historical fact. A null here means
     * "this run predates versions", which is true, rather than "the version is missing".
     *
     * **The reference goes this way round** — run → version, not version → run — because one version
     * can be run many times and the run is the thing that arrives later. `set null` rather than
     * `cascade`: deleting a version must not delete the evidence of what it scored.
     */
    version: text("version").references(() => promptVersions.id, { onDelete: "set null" }),
    /**
     * The A/B this run is one half of (EPIC-041), or null for an ordinary run.
     *
     * **A shared id rather than a table**, and a `cmp_` id rather than a self-reference. Two runs of
     * one comparison carry the same value; that is the whole relationship, and it has no attributes
     * of its own beyond the two rows that already hold the version, the input set and the results.
     * A join table for a two-element set written once would be a second place for the same fact to
     * live, which is the argument `prompt_versions` makes for having no `passRate` column.
     *
     * Not a self-reference (`otherRun`) because that fact would then be written twice, once on each
     * row, and the two copies can disagree — which is exactly the failure a shared key cannot have.
     *
     * Nullable, and most runs are: an ordinary run is not being compared with anything.
     */
    comparison: text("comparison"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
  },
  (table) => [
    // Run history is "this prompt's runs, newest first", on every load of the runs page.
    index("suite_runs_prompt_created_idx").on(table.prompt, table.createdAt),
  ],
);

/**
 * One check, frozen as it stood when the run was triggered.
 *
 * **Stored rather than re-derived**, and that is the whole reason this table exists. Re-compiling
 * later would grade against bloks whose text has since changed and attribute a failure to a blok
 * that no longer says that. Versions are EPIC-040's; not re-deriving is this epic's.
 *
 * `blokText` is the blok's **verbatim** text (`CLAUDE.md` rule 3), never a paraphrase, because it
 * is what the failure detail shows next to the output it is about.
 */
export const suiteChecks = pgTable(
  "suite_checks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newSuiteCheckId()),
    suiteRun: text("suite_run")
      .notNull()
      .references(() => suiteRuns.id, { onDelete: "cascade" }),
    /** `compile()`'s content-derived check id, kept so a result can be linked to across a recompile. */
    checkId: text("check_id").notNull(),
    /** **Exactly one, always** — by construction in `compile()`, asserted in core's `grade.test.ts`. */
    blokId: text("blok_id").notNull(),
    blokKind: text("blok_kind").notNull(),
    blokText: text("blok_text").notNull(),
    /** One of core's eight `CheckKind`s, or null when none could honestly be named. */
    kind: text("kind"),
    /** Position in the compiled order, so the results list reads in the order of the prompt. */
    position: integer("position").notNull(),
  },
  (table) => [index("suite_checks_run_idx").on(table.suiteRun, table.position)],
);

/**
 * One check, graded against one input.
 *
 * `run` points at the `runs` row that produced the output — the output itself is **not copied
 * here**, so rule 6's twelve-month purge stays the only clock on it. When the payload has been
 * purged the failure detail says so rather than showing an empty box.
 */
export const suiteResults = pgTable(
  "suite_results",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newSuiteResultId()),
    suiteRun: text("suite_run")
      .notNull()
      .references(() => suiteRuns.id, { onDelete: "cascade" }),
    suiteCheck: text("suite_check")
      .notNull()
      .references(() => suiteChecks.id, { onDelete: "cascade" }),
    /** Which row of the input set, 0-based, so the surface can say "input 7" and mean the file. */
    inputIndex: integer("input_index").notNull(),
    /** Null when no provider call produced this — there is no such result today, but a purge is coming. */
    run: text("run").references(() => runs.id, { onDelete: "set null" }),
    /** `pass` · `fail` · `not_graded`. Never a fourth. */
    outcome: text("outcome").notNull(),
    /** Present exactly when the outcome is `not_graded`. One of core's four `NotGradedReason`s. */
    reason: text("reason"),
    /** Core's `Evidence`: an excerpt with offsets, a measurement, an absence, or a shape. */
    evidence: jsonb("evidence"),
  },
  (table) => [
    index("suite_results_run_idx").on(table.suiteRun),
    index("suite_results_check_idx").on(table.suiteCheck),
  ],
);

/**
 * One frozen version of a prompt's blok set (EPIC-040).
 *
 * ## `n` is the N in ADR-003's "Draft vN"
 *
 * One vocabulary across the editor, Versions and Deploy, and it is an **ordinal a person counts in**
 * rather than a timestamp or an id they would have to recognise. Unique per prompt, 1-based.
 *
 * ## When a row appears, and why it is not one per save
 *
 * `docs/roadmap.md` says "version on save", and `blok-editor.tsx` autosaves on a debounce — so
 * taken literally, one typed paragraph is a dozen versions and EPIC-041 inherits a history nobody
 * can read. Three rules instead, in `versions.ts`:
 *
 * 1. a save whose `compiledHash` matches the newest row writes **nothing**;
 * 2. otherwise, while the newest row is unpinned it is **rewritten in place** — same `n`;
 * 3. **a run pins it**, and the next save after that mints `n + 1`.
 *
 * The result is one version per episode of editing between runs, with no timer, no background job
 * and no arbitrary quiet window to defend. Confirmed by Soroush, 2026-09-16.
 *
 * ## `pinnedAt` is the whole of the immutability rule
 *
 * Null means this is the open draft and further edits land on it. Non-null means something has
 * pointed at it — today a run, later a publish — and it may never change again. There is no
 * separate state column, because a second field could disagree with this one and then something
 * would have to decide which is true.
 *
 * ## There is no `passRate` column
 *
 * It is a join over `suite_runs` and `suite_results` (`passRateForVersions`). A column would be a
 * second copy of a number that already exists and can go stale against it. EPIC-034's precedent is
 * explicit: the one thing it stored rather than derived, `passedNotifiedAt`, was stored because it
 * was a fact with **no other home**. A pass rate has one.
 */
export const promptVersions = pgTable(
  "prompt_versions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newPromptVersionId()),
    prompt: text("prompt")
      .notNull()
      .references(() => prompts.id, { onDelete: "cascade" }),
    /** 1-based, unique per prompt. The N a person reads as "Draft vN". */
    n: integer("n").notNull(),
    /**
     * Core's `VersionSnapshot["bloks"]`: the blok set, verbatim, in compile order, with each blok's
     * hand edit.
     *
     * **A frozen document, not a relation.** No foreign keys reach into it, deliberately: a blok
     * deleted tomorrow must not alter what this row says happened yesterday, and a cascade would do
     * exactly that.
     */
    snapshot: jsonb("snapshot").notNull(),
    /**
     * The compiled prompt, frozen — the same exception `suite_runs.promptText` makes and for the
     * same reason. Recompiling later would render it under whatever `COMPILER_VERSION` is current
     * then, and history is the one thing a compiler change may not rewrite.
     */
    compiledText: text("compiled_text").notNull(),
    /**
     * `contentHash(compiledText)` — the same digest `suite_runs.promptHash` records, so a version
     * and the run pinned to it can be checked against each other.
     *
     * **It is not the dedupe key.** It was, until EPIC-041's drive found that an `expected` blok
     * emits no text, so a changed check set produced an identical compiled hash and rule 1 wrote
     * nothing at all. `snapshotHash` below is the dedupe key; `versions.ts`'s `snapshotHashOf` has
     * the three things that went wrong.
     */
    compiledHash: text("compiled_hash").notNull(),
    /**
     * The digest of the whole blok set: **the key rule 1 compares** (EPIC-041).
     *
     * Nullable only because rows written before it existed have none, and null never equals
     * anything — so the first save after this landed rewrites or mints instead of deduping against
     * a key nobody recorded. Wrong in the safe direction: an extra version, never a missing one.
     */
    snapshotHash: text("snapshot_hash"),
    /** A person's own words about this version. EPIC-041 writes it; nothing in EPIC-040 does. */
    note: text("note"),
    /** Null while this is the open draft; set the moment something points at it. Then immutable. */
    pinnedAt: timestamp("pinned_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    // The guard on rule 3's insert. Two tabs racing to mint `n + 1` is a real sequence, and letting
    // the database settle it is EPIC-034's `claimPassedNotification` precedent rather than a
    // read-then-write that is correct only most of the time.
    uniqueIndex("prompt_versions_prompt_n_idx").on(table.prompt, table.n),
  ],
);

/**
 * **The one table in this schema that holds somebody else's credential** (EPIC-043).
 *
 * `docs/security/byo-key-threat-model.md` is the reasoning; this comment is the part a person
 * reading the schema has to know.
 *
 * Three properties, each of which is a column or the absence of one:
 *
 * 1. **There is no column a plaintext key could sit in.** `sealed` holds a `41pk1.…` envelope from
 *    `sealed-box.ts` and nothing else; `lastFour` is the four characters the provider's own console
 *    prints, which is what a person recognises their key by. A dump of this table is ciphertext.
 * 2. **The master key is not here.** It is an environment value, so a stolen database — the most
 *    likely of the five threats, and the one the nightly dump to R2 widens — is not a stolen key.
 * 3. **`keyId` says which master key sealed the row**, so a rotation can find its own work with one
 *    query instead of trying every row against every key. Rotation is a threat class in its own
 *    right precisely because an undesigned rotation never happens.
 *
 * `(owner, provider)` is unique: one key each, replaced rather than accumulated. Nothing here is a
 * history — a superseded credential is a liability, not a record.
 */
export const providerKeys = pgTable(
  "provider_keys",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newProviderKeyId()),
    owner: text("owner")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** `anthropic` | `openai` | `google`. Text, with the closed set in TypeScript — CLAUDE.md's
     * vocabulary forbids the word for a database type of that shape, and a text column plus a
     * validated union adds a provider without a migration. */
    provider: text("provider").notNull(),
    /** The sealed envelope. Bound to `(owner, provider)`, so it cannot be moved to another row. */
    sealed: text("sealed").notNull(),
    /** Which master key sealed it. Not secret; it is already inside the envelope. */
    keyId: text("key_id").notNull(),
    /** The last four characters, for recognition. Never enough to use, and providers print it too. */
    lastFour: text("last_four").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    /** Set when the value is replaced, so "when did this key last change" is answerable. */
    rotatedAt: timestamp("rotated_at"),
    /** Set by EPIC-042 when a run opens it. Null here, because nothing in EPIC-043 runs anything. */
    lastUsedAt: timestamp("last_used_at"),
  },
  (table) => [uniqueIndex("provider_keys_owner_provider_idx").on(table.owner, table.provider)],
);
