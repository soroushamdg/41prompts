import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  addBlok,
  bloksForPrompt,
  deleteBlok,
  moveBlok,
  promptForOwner,
  restoreBlok,
  setBlokText,
  setHandEdit,
} from "./canvas";
import { createDb, type Db } from "./client";
import { newProjectId } from "./ids";
import { RANK_MAX_LENGTH } from "./rank";
import { bloks, projects, prompts, users } from "./schema";

/**
 * Against the shared development database, like `m1-count.test.ts`, and cleaned up by owner: every
 * row this file makes hangs off one of two users it creates and deletes, and the cascades take the
 * projects, prompts and bloks with them.
 */
const OWNER = "canvas-test-owner";
const OTHER = "canvas-test-other";

describe("the canvas, owner-scoped", () => {
  let db: Db;
  let promptId: string;

  beforeAll(() => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required to run this test");
    db = createDb(databaseUrl);
  });

  async function clear(): Promise<void> {
    for (const id of [OWNER, OTHER]) await db.delete(users).where(eq(users.id, id));
  }

  beforeEach(async () => {
    await clear();
    for (const [id, email] of [
      [OWNER, "canvas-owner@example.test"],
      [OTHER, "canvas-other@example.test"],
    ]) {
      await db.insert(users).values({ id, name: id, email });
    }
    const project = newProjectId();
    await db.insert(projects).values({ id: project, owner: OWNER, name: "Canvas", slug: `canvas-${project}` });
    const [row] = await db.insert(prompts).values({ project, name: "Router" }).returning({ id: prompts.id });
    promptId = row!.id;
  });

  afterAll(clear);

  /**
   * ── Decision 5 ──────────────────────────────────────────────────────────────────────────────
   *
   * **The named test, at the level where the real failure would happen.** The core version proves
   * the maths; this one proves the write path, and the write path is where a hand edit actually gets
   * lost — by an insert that turns out to be a read-modify-write over the whole prompt.
   *
   * The failure is silent: nothing throws, and the recompiled prompt looks entirely plausible.
   */
  describe("a hand edit survives adding an unrelated blok", () => {
    const HAND_WRITTEN = "Reply in at most 60 words, and never hedge.";

    async function withHandEdit(): Promise<{ edited: string; other: string }> {
      const a = await addBlok(db, promptId, { kind: "context", text: "You route support email." });
      const b = await addBlok(db, promptId, { kind: "constraint", text: "Reply in at most 80 words." });
      await setHandEdit(db, promptId, b.id, { text: HAND_WRITTEN, fromHash: "0123456789abcdef" });
      return { edited: b.id, other: a.id };
    }

    it("survives adding a blok", async () => {
      const { edited } = await withHandEdit();
      await addBlok(db, promptId, { kind: "constraint", text: "Always sign off." });

      const after = (await bloksForPrompt(db, promptId)).find((blok) => blok.id === edited)!;
      expect(after.editedText).toBe(HAND_WRITTEN);
      expect(after.editedFromHash).toBe("0123456789abcdef");
    });

    it("survives adding a blok in front of it, which is the case that moves ranks", async () => {
      const { edited } = await withHandEdit();
      const all = await bloksForPrompt(db, promptId);
      await addBlok(db, promptId, { kind: "context", text: "Inserted first." }, { before: null, after: all[0]!.rank });

      const after = (await bloksForPrompt(db, promptId)).find((blok) => blok.id === edited)!;
      expect(after.editedText).toBe(HAND_WRITTEN);
    });

    it("survives another blok's text being autosaved, deleted and restored", async () => {
      const { edited, other } = await withHandEdit();
      await setBlokText(db, promptId, other, "You route inbound support email.");
      await deleteBlok(db, promptId, other);
      await restoreBlok(db, promptId, other);

      const after = (await bloksForPrompt(db, promptId)).find((blok) => blok.id === edited)!;
      expect(after.editedText).toBe(HAND_WRITTEN);
      expect(after.editedFromHash).toBe("0123456789abcdef");
    });

    it("survives a reorder, including one that forces a rebalance", async () => {
      const { edited, other } = await withHandEdit();
      const all = await bloksForPrompt(db, promptId);
      await moveBlok(db, promptId, other, { before: all[all.length - 1]!.rank, after: null });

      const after = (await bloksForPrompt(db, promptId)).find((blok) => blok.id === edited)!;
      expect(after.editedText).toBe(HAND_WRITTEN);
    });

    /**
     * The structural claim, asserted rather than argued: adding a blok is **one INSERT**, so it
     * cannot write another row. If this ever becomes a read-modify-write over the prompt, the silent
     * failure is possible again and this test is what says so.
     */
    it("adds a blok without updating any other row", async () => {
      const { edited, other } = await withHandEdit();
      const before = await db.select({ id: bloks.id, updatedAt: bloks.updatedAt }).from(bloks).where(eq(bloks.prompt, promptId));

      await new Promise((resolve) => setTimeout(resolve, 5));
      await addBlok(db, promptId, { kind: "example", text: "Input: x / Output: y" });

      const after = await db.select({ id: bloks.id, updatedAt: bloks.updatedAt }).from(bloks).where(eq(bloks.prompt, promptId));
      for (const row of before) {
        const now = after.find((candidate) => candidate.id === row.id)!;
        expect(now.updatedAt.getTime(), `${row.id} was written by an insert of a different blok`).toBe(
          row.updatedAt.getTime()
        );
      }
      expect([edited, other].every((id) => after.some((row) => row.id === id))).toBe(true);
    });
  });

  describe("owner scoping", () => {
    it("resolves the prompt for its owner", async () => {
      expect(await promptForOwner(db, promptId, OWNER)).toMatchObject({ id: promptId, name: "Router" });
    });

    it("does not resolve it for anybody else — the route turns this into 404, not 403", async () => {
      expect(await promptForOwner(db, promptId, OTHER)).toBeUndefined();
    });

    it("does not resolve a prompt whose project is deleted", async () => {
      const found = (await promptForOwner(db, promptId, OWNER))!;
      await db.update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, found.project));
      expect(await promptForOwner(db, promptId, OWNER)).toBeUndefined();
    });
  });

  describe("blok text is stored byte for byte", () => {
    it.each([
      ["CRLF", "line one\r\nline two\r\n"],
      ["tabs and trailing space", "\tindented\t\nand a trailing space \n"],
      ["astral emoji", "Ship it 🚀 when the checks pass."],
      ["RTL and combining marks", "مرحبا — Café, with a combining mark: Café."],
    ])("round-trips %s unchanged", async (_name, text) => {
      const added = await addBlok(db, promptId, { kind: "context", text });
      const back = (await bloksForPrompt(db, promptId)).find((blok) => blok.id === added.id)!;
      expect(back.text).toBe(text);
      expect([...back.text]).toEqual([...text]);
    });
  });

  describe("ordering", () => {
    it("reads bloks in rank order, and a move writes one row", async () => {
      const a = await addBlok(db, promptId, { kind: "context", text: "first" });
      const b = await addBlok(db, promptId, { kind: "context", text: "second" });
      const c = await addBlok(db, promptId, { kind: "context", text: "third" });
      expect((await bloksForPrompt(db, promptId)).map((x) => x.text)).toEqual(["first", "second", "third"]);

      const result = await moveBlok(db, promptId, c.id, { before: a.rank, after: b.rank });
      expect(result).toBe("moved");
      expect((await bloksForPrompt(db, promptId)).map((x) => x.text)).toEqual(["first", "third", "second"]);
    });

    it("keeps a deleted blok out of the canvas, and undo brings it back in place", async () => {
      await addBlok(db, promptId, { kind: "context", text: "first" });
      const b = await addBlok(db, promptId, { kind: "context", text: "second" });
      await addBlok(db, promptId, { kind: "context", text: "third" });

      await deleteBlok(db, promptId, b.id);
      expect((await bloksForPrompt(db, promptId)).map((x) => x.text)).toEqual(["first", "third"]);

      await restoreBlok(db, promptId, b.id);
      // Order comes back too, not just the text — the rank was never touched by the delete.
      expect((await bloksForPrompt(db, promptId)).map((x) => x.text)).toEqual(["first", "second", "third"]);
    });

    /**
     * **The rebalance, driven rather than waited for.** Repeatedly dropping a card into the same gap
     * is what a month of ordinary use looks like, and it is the only path in the canvas that writes
     * more than one row. A rebalance that first fires in production is a rebalance nobody has run.
     */
    it("rebalances when keys grow too long, and the order survives it", async () => {
      const a = await addBlok(db, promptId, { kind: "context", text: "first" });
      const b = await addBlok(db, promptId, { kind: "context", text: "second" });
      const mover = await addBlok(db, promptId, { kind: "context", text: "mover" });

      // Base 62 gives about five insertions per extra character, so passing RANK_MAX_LENGTH (32)
      // takes roughly 160 moves into the same gap. 220 leaves margin without making the test vague
      // about what it is waiting for.
      let outcome: "moved" | "rebalanced" = "moved";
      let upper = b.rank;
      let moves = 0;
      for (; moves < 220 && outcome === "moved"; moves++) {
        outcome = await moveBlok(db, promptId, mover.id, { before: a.rank, after: upper });
        upper = (await bloksForPrompt(db, promptId)).find((x) => x.id === mover.id)!.rank;
      }

      expect(outcome, `${moves} same-slot moves did not reach the rebalance`).toBe("rebalanced");

      const after = await bloksForPrompt(db, promptId);
      expect(after.map((x) => x.text)).toEqual(["first", "mover", "second"]);
      expect(after.every((x) => x.rank.length <= RANK_MAX_LENGTH)).toBe(true);
      // Still strictly ordered afterwards, by byte order.
      expect([...after.map((x) => x.rank)].sort()).toEqual(after.map((x) => x.rank));
    });

    it("orders by byte order, agreeing with rank.ts's alphabet rather than a locale", async () => {
      // `Z` sorts before `a` in byte order and after it in many locales. If the query's collation
      // disagreed with `rank.ts`, these two would come back swapped.
      await db.insert(bloks).values([
        { prompt: promptId, kind: "context", text: "upper", rank: "Z" },
        { prompt: promptId, kind: "context", text: "lower", rank: "a" },
      ]);
      expect((await bloksForPrompt(db, promptId)).map((x) => x.text)).toEqual(["upper", "lower"]);
    });
  });
});
