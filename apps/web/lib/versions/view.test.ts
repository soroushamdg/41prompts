import { diff, snapshot, type PromptBlok } from "@41prompts/core";
import { describe, expect, it } from "vitest";
import {
  byteDeltaWords,
  compiledBytes,
  diffLines,
  excerpt,
  passRateWords,
  runVersionWords,
  versionName,
  versionRows,
} from "./view";

/**
 * The sentences the Versions page says.
 *
 * **The diff fixtures go through the real `diff()`**, not through hand-built `VersionDiff` objects.
 * Hand-building one would let this file assert what it already believes: the roadmap's named test is
 * *a moved blok reads as moved*, and a fixture that simply sets `moved: [...]` proves the renderer
 * can render a list somebody typed. Compiling two real snapshots and dragging a blok between them
 * is the case that would actually regress.
 */

const bloks = (...texts: [string, PromptBlok["kind"]][]): PromptBlok[] =>
  texts.map(([text, kind], index) => ({ id: `b${index + 1}`, kind, text, order: index }));

const BASE = bloks(
  ["You route inbound support email.", "context"],
  ["Reply in at most 80 words.", "constraint"],
  ["Respond with valid JSON.", "expected"],
);

describe("versionName", () => {
  it("is Draft vN, always", () => {
    // ADR-003: one vocabulary across the editor, Versions and Deploy. `Live vN` means published and
    // nothing here has ever been published, so a pinned version is still a Draft.
    expect(versionName({ n: 1 })).toBe("Draft v1");
    expect(versionName({ n: 41 })).toBe("Draft v41");
  });
});

describe("passRateWords", () => {
  it("says no run yet when nothing has been run", () => {
    expect(passRateWords(undefined)).toBe("No run yet.");
  });

  it("says a run is in flight rather than no run yet", () => {
    // These are different facts and the difference is what stops somebody pressing the button twice.
    expect(passRateWords(undefined, true)).toBe("A run is in flight.");
  });

  it("gives the counts with the percentage, never the percentage alone", () => {
    expect(passRateWords({ versionId: "v", passed: 16, graded: 17, total: 17, rate: 16 / 17 })).toBe(
      "16 of 17 checks passed — 94%.",
    );
  });

  it("names what could not be graded, without folding it into the rate", () => {
    expect(passRateWords({ versionId: "v", passed: 3, graded: 4, total: 6, rate: 0.75 })).toBe(
      "3 of 4 checks passed — 75%, and 2 could not be graded.",
    );
  });

  it("does not say 0% when nothing could be graded", () => {
    // EPIC-030 made `not_graded` a third outcome that is never folded into a fail. "0%" would say
    // this version failed everything, which is the one thing it did not do.
    expect(passRateWords({ versionId: "v", passed: 0, graded: 0, total: 4, rate: null })).toBe(
      "Nothing could be graded — 4 results, none of them a pass or a fail.",
    );
  });

  it("says nothing was checked when the run had no checks at all", () => {
    expect(passRateWords({ versionId: "v", passed: 0, graded: 0, total: 0, rate: null })).toBe(
      "Nothing was checked.",
    );
  });
});

describe("versionRows", () => {
  const row = (n: number, pinnedAt: Date | null, note: string | null = null) => ({
    id: `pv_${n}`,
    n,
    snapshot: [],
    compiledText: "",
    compiledHash: "",
    note,
    pinnedAt,
    createdAt: new Date("2026-09-16T10:00:00Z"),
    updatedAt: new Date("2026-09-16T11:30:00Z"),
  });

  it("names every version Draft vN and carries its note and time", () => {
    const [first] = versionRows([row(2, null, "before the refund change")], new Map(), new Set());
    expect(first?.name).toBe("Draft v2");
    expect(first?.note).toBe("before the refund change");
    expect(first?.when).toBe("2026-09-16 11:30");
  });

  it("marks the open one and explains it in a sentence rather than a second state name", () => {
    const rows = versionRows([row(2, null), row(1, new Date())], new Map(), new Set());
    expect(rows[0]?.open).toBe(true);
    expect(rows[0]?.openNote).toContain("edits land here");
    expect(rows[1]?.open).toBe(false);
    // ADR-003 forbids "current", "latest" and "unsaved" as state names. The row says what is true
    // about it in words instead of inventing a second vocabulary beside Draft/Live.
    for (const view of rows) {
      expect(view.openNote.toLowerCase()).not.toMatch(/\b(current|latest|unsaved)\b/);
    }
  });
});

describe("diffLines", () => {
  it("reports a moved blok as moved, never as removed plus added", () => {
    // `docs/roadmap.md`'s named test, carried up to the surface that shows it. A correct diff
    // rendered as "removed, added" would mislead exactly as much as a wrong one.
    const a = snapshot(BASE);
    const dragged = [
      { ...BASE[1]!, order: 0 },
      { ...BASE[0]!, order: 1 },
      { ...BASE[2]!, order: 2 },
    ];
    const lines = diffLines(diff(a, snapshot(dragged)));

    expect(lines.map((line) => line.verb).sort()).toEqual(["moved", "moved"]);
    expect(lines.every((line) => line.verb !== "removed" && line.verb !== "added")).toBe(true);
    expect(lines.find((line) => line.blokId === "b2")?.detail).toBe("position 2 → 1");
  });

  it("reports an added blok with its kind and position, counting from one", () => {
    const added = [...BASE, { id: "b4", kind: "constraint" as const, text: "Never promise a refund.", order: 3 }];
    const lines = diffLines(diff(snapshot(BASE), snapshot(added)));

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ verb: "added", what: "Constraint blok" });
    // Zero-based in the snapshot because it is an array; one-based here because a person is looking
    // at a list of cards.
    expect(lines[0]?.detail).toBe("“Never promise a refund.” · at position 4");
  });

  it("reports a removed blok", () => {
    const lines = diffLines(diff(snapshot(BASE), snapshot(BASE.slice(0, 2))));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ verb: "removed", what: "Expected blok", detail: "“Respond with valid JSON.”" });
  });

  it("reports a rewritten blok as before → after", () => {
    const edited = BASE.map((blok) => (blok.id === "b2" ? { ...blok, text: "Reply in at most 40 words." } : blok));
    const lines = diffLines(diff(snapshot(BASE), snapshot(edited)));
    expect(lines[0]).toMatchObject({ verb: "changed" });
    expect(lines[0]?.detail).toBe("“Reply in at most 80 words.” → “Reply in at most 40 words.”");
  });

  it("says what changed when a blok was reclassified and its text was not", () => {
    // Every character is the same and the compiled prompt is different, because an expected blok
    // compiles to a check and emits no text. A line reading `"x" → "x"` would look like a bug.
    const reclassified = BASE.map((blok) => (blok.id === "b2" ? { ...blok, kind: "expected" as const } : blok));
    const lines = diffLines(diff(snapshot(BASE), snapshot(reclassified)));
    expect(lines[0]?.verb).toBe("changed");
    expect(lines[0]?.detail).toBe(
      "was a constraint blok, now an expected blok · “Reply in at most 80 words.”",
    );
  });

  it("reports a blok that was both rewritten and moved, once in each list", () => {
    const both = [
      { ...BASE[1]!, text: "Reply in at most 40 words.", order: 0 },
      { ...BASE[0]!, order: 1 },
      { ...BASE[2]!, order: 2 },
    ];
    const lines = diffLines(diff(snapshot(BASE), snapshot(both)));
    const mine = lines.filter((line) => line.blokId === "b2").map((line) => line.verb);
    // "You rewrote it" and "you moved it" are two facts, and a reader asked only one of them.
    expect(mine.sort()).toEqual(["changed", "moved"]);
  });

  it("is empty for two identical versions", () => {
    expect(diffLines(diff(snapshot(BASE), snapshot(BASE)))).toEqual([]);
  });
});

describe("byteDeltaWords", () => {
  it("gives before, after and the signed delta", () => {
    const before = snapshot(BASE);
    const after = snapshot([...BASE, { id: "b4", kind: "constraint", text: "Never promise a refund.", order: 3 }]);
    const bytes = compiledBytes(before.compiledText);
    const words = byteDeltaWords(diff(before, after), bytes);
    expect(words).toMatch(/^\d+ → \d+ bytes · \+\d+$/);
  });

  it("says no change rather than +0", () => {
    const before = snapshot(BASE);
    expect(byteDeltaWords(diff(before, snapshot(BASE)), 100)).toBe("100 → 100 bytes · no change");
  });

  it("counts bytes rather than code units", () => {
    // The two disagree on every emoji, which is exactly where a prompt author would be misled about
    // how big the thing they are sending is.
    expect(compiledBytes("a")).toBe(1);
    expect(compiledBytes("é")).toBe(2);
    expect(compiledBytes("日")).toBe(3);
    expect(compiledBytes("👩")).toBe(4);
  });
});

describe("runVersionWords", () => {
  it("says a run predates version history rather than implying a version", () => {
    // EPIC-040 §11.2's inherited obligation: `suite_runs.version` is nullable and stays nullable,
    // and the surface owes those runs a true sentence.
    expect(runVersionWords({ version: null }, new Map())).toBe("This run predates version history.");
  });

  it("names the version when there is one", () => {
    expect(runVersionWords({ version: "pv_a" }, new Map([["pv_a", 3]]))).toBe("Ran Draft v3");
  });

  it("says so when the version no longer resolves", () => {
    expect(runVersionWords({ version: "pv_gone" }, new Map())).toBe(
      "Ran a version that is no longer in this history.",
    );
  });
});

describe("excerpt", () => {
  it("quotes somebody's words rather than paraphrasing them", () => {
    expect(excerpt("Reply in at most 80 words.")).toBe("“Reply in at most 80 words.”");
  });

  it("collapses whitespace so a multi-line blok stays one line", () => {
    expect(excerpt("one\n\n  two")).toBe("“one two”");
  });

  it("truncates by code point, so an emoji is never cut in half", () => {
    expect(excerpt("👩‍💻".repeat(10), 3)).toBe("“👩‍💻…”");
  });

  it("says (empty) rather than quoting nothing", () => {
    expect(excerpt("   ")).toBe("(empty)");
  });
});
