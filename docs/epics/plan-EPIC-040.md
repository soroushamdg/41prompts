<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# Plan · EPIC-040 · versions and semantic diff

Written 2026-09-16, before any code. `docs/epics/EPIC-040-versions-and-diff.md` is the epic.

---

## 1. The shape, in one paragraph

`packages/core` gains a pure `diff(a, b)` over two blok-set **snapshots** — plain data, no IO, no
database types. `packages/db` gains `prompt_versions` and the three operations that maintain it:
mint-or-update the open draft, pin it, and read history. `apps/web` calls the first from the canvas
save path and the second from `startRunAction`. Nothing renders; EPIC-041 does that.

## 2. What goes where, and why

| layer | what | why there |
|---|---|---|
| `packages/core/src/version/` | `Snapshot`, `VersionDiff`, `diff()`, `snapshotHash()` | `CLAUDE.md` rule 1: logic that must be correct lives in core with tests. A diff is the definition of "what changed", which EPIC-041 renders, EPIC-050 freezes into an artifact and the CLI will print. Three consumers is the argument against putting it in the web app. |
| `packages/db/src/versions.ts` | the table, `recordVersion()`, `pinVersion()`, `versionsForPrompt()`, `passRateByVersion()` | Drizzle and IO. Core never sees a `Db`. |
| `apps/web/lib/canvas/actions.ts` | one call after each mutating action | The save path already exists and already revalidates; this is one more line per action, not a new mechanism. |
| `apps/web/lib/runs/actions.ts` | pin inside `startRunAction`, before `createSuiteRun` | `compiledNow()` is already called there and is exactly the snapshot to pin. |

## 3. The table

```
prompt_versions
  id            pv_ + 8 hex                    (ids.ts, new mint)
  prompt        → prompts.id, cascade
  n             integer                        the N in "Draft vN", 1-based, unique per prompt
  snapshot      jsonb                          the blok set, verbatim
  compiledText  text
  compiledHash  text                           contentHash(compiledText) — the dedupe key
  note          text, nullable                 EPIC-041 lets a person write one; nothing writes it here
  pinnedAt      timestamp, nullable            null = the open draft; set = immutable
  createdAt / updatedAt
  unique (prompt, n)
  index (prompt, n desc)
```

**`snapshot` holds `{ id, kind, text, rank, editedText, editedFromHash }` per blok**, in rank order,
deleted bloks excluded. Verbatim (rule 3), hand edits included (note 3 of the epic file).

**No `passRate` column.** It is a join over `suite_runs` and `suite_results`. A column would be a
second copy of a number that already exists, and EPIC-034's precedent is explicit: the only thing
stored rather than derived in that epic was the one fact with no other home. Pass rate has a home.

**No `blok_id` foreign keys inside the snapshot.** It is a frozen document, not a relation — a blok
deleted tomorrow must not alter what a version says happened yesterday.

## 4. When a version is written — the three rules, as code

Every mutating canvas action ends in one call:

```
recordVersion(db, promptId, snapshot, compiledText)
```

which does exactly this, in one statement where it can be:

1. Compute `compiledHash`. **If it equals the newest version's hash, return without writing.**
2. Else if the newest version has `pinnedAt IS NULL`, `UPDATE` it in place — same `n`.
3. Else `INSERT` with `n = newest.n + 1`.

`pinVersion(db, promptId)` sets `pinnedAt = now()` on the newest unpinned row and returns its id,
which `startRunAction` stores on the run.

**Why `suite_runs` gets a nullable `version` column** rather than the version getting a run column:
one version can be run many times, and the run is the thing that arrives later. Nullable because
every run that already exists predates this epic and must keep working.

## 5. `diff(a, b)`

```ts
type VersionDiff = {
  added:   { blokId, kind, text, position }[]
  removed: { blokId, kind, text, position }[]
  changed: { blokId, kind, before, after, position }[]
  moved:   { blokId, kind, from, to }[]
  compiledByteDelta: number          // b.compiledText length − a.compiledText, in UTF-8 bytes
}
```

**Matched by `blokId`, never by text.** Then, for a blok in both:

- text differs → `changed` (and if its position also differs, it is `changed` **and** `moved`; they
  are separate lists and a blok may appear in both, because "you rewrote it and moved it" is two
  facts and collapsing them loses one).
- text identical, ordinal position differs → `moved`.
- neither → absent from the diff entirely.

**Position is the ordinal index in the rank-sorted list, not the rank string** (epic note 2). Two
versions' fractional indices are not comparable and a rebalance changes every rank without moving
anything.

**The roadmap's named test** — *moved ≠ removed + added* — is a fixture where one blok's position
changes and nothing else does: `moved` has one entry, `added` and `removed` are both empty.

## 6. Order of work

1. `packages/core/src/version/` — types, `diff()`, fixtures. Pure, no database, fastest to get right.
2. `packages/db` — `ids.ts` mint, schema, migration `0010`, `versions.ts`, tests.
3. `suite_runs.version` column, same migration.
4. `apps/web` — wire `recordVersion` into the canvas actions and `pinVersion` into `startRunAction`.
5. The 100 × 50 size measurement, as a test that prints (the `detect.perf.test.ts` shape).
6. Gates, report, session log, backlog row.

## 7. The traps I expect

**Recompiling on every save to get `compiledText`.** The canvas actions do not currently compile;
`compiledNow()` lives in the runs path. Compiling on every debounce tick is real work. Mitigation:
`compile()` is already cached per blok by content hash (rule 4), so the cost is the join, not the
render — but this gets measured rather than assumed, and if it is not cheap the fallback is to
compute `compiledHash` from the blok hashes alone and store `compiledText` only when a version is
pinned.

**A race between two tabs.** Two saves landing together could both read "newest is unpinned" and
both update it. That is benign — they write the same kind of thing — but two *inserts* racing on
`n + 1` would violate `unique (prompt, n)`. The unique constraint is the guard, and the insert path
retries once. EPIC-034's `claimPassedNotification` is the precedent for letting the database settle
it rather than a read-then-write.

**`snapshotHash` is not `blokHash`.** `packages/core`'s existing `blokHash` covers one blok.
Reusing its name for a set would be the key-collision shape `packages/core/src/key-collision.test.ts`
exists to catch. The compiled text's `contentHash` is the dedupe key and there is no second hash.

**The epic ships no route.** Criterion-by-criterion, the report must say so rather than leaving a
drive box unticked — unless step 4 turns out to change something a person sees, in which case there
is a drive and it happens against the built app.

## 8. What this plan does not do

Restore, the Versions page, publishing, the artifact. All named in the epic's Out of scope, all
later epics, none of them made harder by the shape above: a version is an immutable snapshot with an
ordinal, which is what every one of them needs.
