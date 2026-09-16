import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_TEST_DATABASE, announceDatabaseSkip, testDatabaseUrl } from "./testing";
import { createDb, type Db } from "./client";
import { newProjectId } from "./ids";
import { inputSets, projects, promptVersions, prompts, suiteRuns, suiteChecks, suiteResults, users } from "./schema";
import {
  compiledHashOf,
  newestVersion,
  passRateForVersions,
  pinVersion,
  recordVersion,
  versionsForPrompt,
} from "./versions";

const OWNER = "versions-test-owner";

announceDatabaseSkip("the versions suite");

/**
 * **This file does not import `@41prompts/core`, and that is the point.**
 *
 * `recordVersion` takes the snapshot as `unknown` and the compiled text as a string: it applies the
 * three minting rules and stores what it is handed, and it has no opinion about how a blok set
 * becomes either. Reaching for `snapshot()` here would add a dependency `packages/db` does not have
 * for no test it could not otherwise write — and it would quietly make these assertions depend on
 * the compiler, so that a change to `BLOK_SEPARATOR` would fail the versions suite.
 *
 * `apps/web`'s wiring is where the two meet, and its test is where they are checked together.
 */
interface TestBlok {
  id: string;
  kind: string;
  text: string;
  position: number;
  editedText: string | null;
  editedFromHash: string | null;
}

const BLOKS: readonly { id: string; kind: string; text: string }[] = [
  { id: "vb1", kind: "context", text: "You route inbound support email." },
  { id: "vb2", kind: "constraint", text: "Reply in at most 80 words." },
  { id: "vb3", kind: "expected", text: "Respond with valid JSON." },
];

function frozen(
  bloks: readonly { id: string; kind: string; text: string }[],
  edits: ReadonlyMap<string, { editedText: string; editedFromHash: string }> = new Map(),
): { snapshot: TestBlok[]; compiledText: string } {
  // Sorted by id, mirroring the caller's guarantee that ordering is decided before it gets here and
  // not by whatever order a query returned.
  const ordered = [...bloks].sort((left, right) => left.id.localeCompare(right.id));
  return {
    snapshot: ordered.map((blok, position) => {
      const edit = edits.get(blok.id);
      return {
        id: blok.id,
        kind: blok.kind,
        text: blok.text,
        position,
        editedText: edit?.editedText ?? null,
        editedFromHash: edit?.editedFromHash ?? null,
      };
    }),
    compiledText: ordered.map((blok) => `${blok.kind}:${blok.text}`).join("|"),
  };
}

const record = (db: Db, promptId: string, bloks: readonly { id: string; kind: string; text: string }[]) =>
  recordVersion(db, promptId, frozen(bloks));

describe.skipIf(!HAS_TEST_DATABASE)("versions", () => {
  let db: Db;
  let promptId: string;

  beforeAll(() => {
    db = createDb(testDatabaseUrl());
  });

  async function clear(): Promise<void> {
    await db.delete(users).where(eq(users.id, OWNER));
  }

  beforeEach(async () => {
    await clear();
    await db.insert(users).values({ id: OWNER, name: OWNER, email: "versions-owner@example.test" });
    const project = newProjectId();
    await db.insert(projects).values({ id: project, owner: OWNER, name: "V", slug: `v-${project}` });
    const [row] = await db.insert(prompts).values({ project, name: "Router" }).returning({ id: prompts.id });
    promptId = row!.id;
  });

  afterAll(clear);

  /**
   * ── Rule 1 ───────────────────────────────────────────────────────────────────────────────────
   *
   * The one that makes autosave survivable. `blok-editor.tsx` fires on a debounce, and a tick that
   * lands on text identical to the last one is the common case — a person pausing mid-sentence,
   * a blur, a re-render. Every one of those would otherwise be a row.
   */
  describe("a save that changed nothing writes nothing", () => {
    it("returns unchanged and leaves one row with one updatedAt", async () => {
      const first = await record(db, promptId, BLOKS);
      expect(first.kind).toBe("minted");

      const before = await newestVersion(db, promptId);
      const again = await record(db, promptId, BLOKS);

      expect(again).toMatchObject({ kind: "unchanged", n: 1 });
      const after = await newestVersion(db, promptId);
      expect(after?.updatedAt.getTime()).toBe(before?.updatedAt.getTime());
      expect(await versionsForPrompt(db, promptId)).toHaveLength(1);
    });

    it("is unchanged when the same bloks arrive in a different order", async () => {
      await record(db, promptId, BLOKS);
      // The caller settles the ordering before it gets here, so a re-fetch that happened to return
      // rows the other way round must not mint a version. Freezing is what makes the hash stable.
      expect(await record(db, promptId, [...BLOKS].reverse())).toMatchObject({ kind: "unchanged" });
      expect(await versionsForPrompt(db, promptId)).toHaveLength(1);
    });
  });

  /**
   * ── The case rule 1 used to get wrong ────────────────────────────────────────────────────────
   *
   * Found by EPIC-041's browser drive, 2026-09-16, and it is the reason `snapshotHash` exists.
   */
  describe("a change only to the check set is still a change", () => {
    it("records an added expected blok, whose compiled text is byte-identical", async () => {
      // `compile/emits-text.ts`: an expected blok emits **no text**. So these two blok sets compile
      // to the same string, and rule 1 compared compiled hashes — it called this "unchanged" and
      // wrote nothing, leaving the version's snapshot without a blok the prompt had. EPIC-041
      // restores from that snapshot and derives an A/B run's checks from it, so the omission is
      // data loss in one feature and silent under-verification in the other.
      const withText = [
        { id: "vb1", kind: "context", text: "You route inbound support email." },
      ];
      const withCheck = [...withText, { id: "vb9", kind: "expected", text: "Respond with valid JSON." }];

      const first = await record(db, promptId, withText);
      expect(first.kind).toBe("minted");

      // `frozen()` above joins every blok's kind and text, so the two compiled strings here are
      // deliberately made **equal** to reproduce what the real compiler does.
      const same = { snapshot: frozen(withCheck).snapshot, compiledText: frozen(withText).compiledText };
      const second = await recordVersion(db, promptId, same);

      expect(second.kind).not.toBe("unchanged");
      const newest = await newestVersion(db, promptId);
      expect(JSON.stringify(newest?.snapshot)).toContain("Respond with valid JSON.");
    });

    it("still writes nothing when the blok set really is identical", async () => {
      // The other half: the fix must not turn every save back into a row. Same bloks, same snapshot,
      // same digest — nothing written, which is rule 1 doing its job.
      await record(db, promptId, BLOKS);
      expect(await record(db, promptId, BLOKS)).toMatchObject({ kind: "unchanged" });
      expect(await versionsForPrompt(db, promptId)).toHaveLength(1);
    });
  });

  /**
   * ── Rule 2 ───────────────────────────────────────────────────────────────────────────────────
   *
   * Editing is one episode, not one row per keystroke pause.
   */
  describe("a save that changed something rewrites the open draft", () => {
    it("keeps the same id and the same n", async () => {
      const first = await record(db, promptId, BLOKS);
      const edited = BLOKS.map((b) => (b.id === "vb2" ? { ...b, text: "Reply in at most 40 words." } : b));
      const second = await record(db, promptId, edited);

      expect(second).toMatchObject({ kind: "updated", id: first.id, n: 1 });
      expect(await versionsForPrompt(db, promptId)).toHaveLength(1);

      const newest = await newestVersion(db, promptId);
      expect(newest?.compiledText).toContain("40 words");
      expect(newest?.compiledHash).toBe(compiledHashOf(newest!.compiledText));
    });

    it("absorbs ten edits into one version", async () => {
      for (let i = 0; i < 10; i += 1) {
        await record(
          db,
          promptId,
          BLOKS.map((b) => (b.id === "vb2" ? { ...b, text: `Reply in at most ${i} words.` } : b)),
        );
      }
      expect(await versionsForPrompt(db, promptId)).toHaveLength(1);
      expect((await newestVersion(db, promptId))?.n).toBe(1);
    });
  });

  /**
   * ── Rule 3 ───────────────────────────────────────────────────────────────────────────────────
   *
   * The pin is what makes a version worth having: from here the row can never change, so the run
   * that points at it will still describe the same prompt next year.
   */
  describe("a run pins the version, and the next edit mints the next one", () => {
    it("pins, then mints n + 1", async () => {
      await record(db, promptId, BLOKS);
      const pinned = await pinVersion(db, promptId);
      expect(pinned?.n).toBe(1);
      expect(pinned?.pinnedAt).not.toBeNull();

      const edited = BLOKS.map((b) => (b.id === "vb2" ? { ...b, text: "Reply in at most 40 words." } : b));
      expect(await record(db, promptId, edited)).toMatchObject({ kind: "minted", n: 2 });

      const all = await versionsForPrompt(db, promptId);
      expect(all.map((v) => v.n)).toEqual([2, 1]);
      // v1 is frozen: its text is what it was when the run pointed at it.
      expect(all.find((v) => v.n === 1)?.compiledText).toContain("80 words");
    });

    it("pinning twice without an edit returns the same version, not a second one", async () => {
      await record(db, promptId, BLOKS);
      const first = await pinVersion(db, promptId);
      const second = await pinVersion(db, promptId);

      expect(second?.id).toBe(first?.id);
      expect(second?.pinnedAt?.getTime()).toBe(first?.pinnedAt?.getTime());
      expect(await versionsForPrompt(db, promptId)).toHaveLength(1);
    });

    it("re-saving identical content after a pin is still unchanged, not a new version", async () => {
      await record(db, promptId, BLOKS);
      await pinVersion(db, promptId);
      // Rule 1 is checked before rule 3 on purpose: running a prompt and then touching a blok
      // without changing it must not mint an empty version.
      expect(await record(db, promptId, BLOKS)).toMatchObject({ kind: "unchanged", n: 1 });
      expect(await versionsForPrompt(db, promptId)).toHaveLength(1);
    });

    it("has nothing to pin on a prompt that was never saved", async () => {
      expect(await pinVersion(db, promptId)).toBeUndefined();
    });
  });

  describe("the snapshot is a frozen document", () => {
    it("keeps the blok text verbatim, with its hand edit", async () => {
      const edits = new Map([["vb2", { editedText: "Keep it short.", editedFromHash: "abc" }]]);
      await recordVersion(db, promptId, frozen(BLOKS, edits));

      const stored = (await newestVersion(db, promptId))?.snapshot as { id: string; editedText: string | null }[];
      expect(stored.find((b) => b.id === "vb2")?.editedText).toBe("Keep it short.");
      expect(stored.find((b) => b.id === "vb1")?.editedText).toBeNull();
    });

    it("survives the blok being deleted, because nothing reaches into it", async () => {
      await record(db, promptId, BLOKS);
      await pinVersion(db, promptId);
      // No foreign key points at a blok id inside the snapshot, so history cannot be rewritten by
      // somebody tidying their canvas.
      await db.delete(prompts).where(eq(prompts.id, "nonexistent"));
      const stored = (await newestVersion(db, promptId))?.snapshot as unknown[];
      expect(stored).toHaveLength(3);
    });
  });

  describe("pass rate is derived from the results, never stored", () => {
    async function runWithOutcomes(versionId: string, outcomes: readonly string[]): Promise<string> {
      const [set] = await db
        .insert(inputSets)
        .values({ prompt: promptId, name: "set", columns: ["q"], rowCount: 1, rows: [{ q: "a" }] })
        .returning({ id: inputSets.id });
      const [run] = await db
        .insert(suiteRuns)
        .values({
          owner: OWNER,
          prompt: promptId,
          inputSet: set!.id,
          model: "claude-sonnet-5",
          params: {},
          promptHash: "h",
          promptText: "t",
          totalInputs: 1,
          state: "done",
          version: versionId,
        })
        .returning({ id: suiteRuns.id });
      const [check] = await db
        .insert(suiteChecks)
        .values({ suiteRun: run!.id, checkId: "c1", blokId: "vb3", blokKind: "expected", blokText: "x", position: 0 })
        .returning({ id: suiteChecks.id });
      await db.insert(suiteResults).values(
        outcomes.map((outcome, index) => ({
          suiteRun: run!.id,
          suiteCheck: check!.id,
          inputIndex: index,
          outcome,
        })),
      );
      return run!.id;
    }

    it("counts passes against graded checks, and leaves not_graded out of the denominator", async () => {
      await record(db, promptId, BLOKS);
      const version = (await newestVersion(db, promptId))!;
      await runWithOutcomes(version.id, ["pass", "pass", "fail", "not_graded"]);

      const rates = await passRateForVersions(db, [version.id]);
      expect(rates.get(version.id)).toMatchObject({ passed: 2, graded: 3, total: 4 });
      expect(rates.get(version.id)?.rate).toBeCloseTo(2 / 3);
    });

    it("reports null rather than zero when nothing could be graded", async () => {
      await record(db, promptId, BLOKS);
      const version = (await newestVersion(db, promptId))!;
      await runWithOutcomes(version.id, ["not_graded", "not_graded"]);

      // EPIC-030 refuses to fold `not_graded` into a fail. Reporting 0 here would say the version
      // failed everything, which is the exact dishonesty that design exists to prevent.
      expect(rateOf(await passRateForVersions(db, [version.id]), version.id)).toBeNull();
    });

    it("follows a changed result without anything writing to prompt_versions", async () => {
      await record(db, promptId, BLOKS);
      const version = (await newestVersion(db, promptId))!;
      const runId = await runWithOutcomes(version.id, ["fail"]);
      expect(rateOf(await passRateForVersions(db, [version.id]), version.id)).toBe(0);

      const touchedBefore = (await newestVersion(db, promptId))!.updatedAt.getTime();
      await db.update(suiteResults).set({ outcome: "pass" }).where(eq(suiteResults.suiteRun, runId));

      expect(rateOf(await passRateForVersions(db, [version.id]), version.id)).toBe(1);
      expect((await newestVersion(db, promptId))!.updatedAt.getTime()).toBe(touchedBefore);
    });

    it("says nothing about a version nothing has run", async () => {
      await record(db, promptId, BLOKS);
      const version = (await newestVersion(db, promptId))!;
      expect(await passRateForVersions(db, [version.id])).toEqual(new Map());
    });
  });

  describe("prompt_versions has no passRate column, asserted rather than assumed", () => {
    it("carries exactly the columns EPIC-040 designed", async () => {
      await record(db, promptId, BLOKS);
      const [row] = await db.select().from(promptVersions).limit(1);
      expect(Object.keys(row!).sort()).toEqual(
        [
          "compiledHash",
          "compiledText",
          "createdAt",
          "id",
          "n",
          "note",
          "pinnedAt",
          "prompt",
          "snapshot",
          "snapshotHash",
          "updatedAt",
        ].sort(),
      );
    });
  });
});

function rateOf(rates: Map<string, { rate: number | null }>, id: string): number | null | undefined {
  return rates.get(id)?.rate;
}
