// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { compile } from "../compile/compile.js";
import type { PromptBlok } from "../compile/types.js";
import { isCompatible, type ContractBreak } from "./compatibility.js";
import { artifactOf, type Artifact, type ArtifactVariable } from "./schema.js";

const BLOKS: readonly PromptBlok[] = [
  { id: "b1", kind: "context", order: 10, text: "You answer support email." },
];

/**
 * An artifact carrying one variable declaration set and nothing else of interest.
 *
 * Built through `artifactOf` rather than as an object literal, so the matrix below exercises the
 * real path — including the name sort, which is what makes "declared in a different order" not a
 * break rather than something this test would have to remember to ignore.
 */
const withVariables = (variables: readonly ArtifactVariable[]): Artifact =>
  artifactOf({
    promptId: "pr_0000beef",
    compiled: compile(BLOKS),
    bloks: BLOKS,
    model: "claude-sonnet-5",
    variables,
  });

const required = (name: string, type?: string): ArtifactVariable => ({
  name,
  defaultValue: null,
  description: null,
  ...(type === undefined ? {} : { type }),
});

const optional = (name: string, defaultValue = "x", type?: string): ArtifactVariable => ({
  name,
  defaultValue,
  description: null,
  ...(type === undefined ? {} : { type }),
});

const breaksBetween = (before: readonly ArtifactVariable[], after: readonly ArtifactVariable[]): readonly ContractBreak[] =>
  isCompatible(withVariables(before), withVariables(after)).breaks;

/**
 * **The compatibility matrix.** Every row is a change somebody can make in the editor, and what it
 * does to an app that is already calling the Live build.
 *
 * The three rows the roadmap names are marked. The fourth break kind, `became_required`, is the one
 * it does not name — a variable that loses its default fails for exactly the callers `added_required`
 * fails for, so leaving it out would have shipped a gate that passes the change it exists to stop.
 */
const MATRIX: readonly (readonly [string, readonly ArtifactVariable[], readonly ArtifactVariable[], readonly ContractBreak[]])[] = [
  ["no change at all", [required("a")], [required("a")], []],
  ["nothing declared, nothing declared", [], [], []],
  ["added optional — every existing caller keeps working", [required("a")], [required("a"), optional("b")], []],
  [
    "added required — roadmap rule 1; a caller that never sent it now leaves a hole",
    [required("a")],
    [required("a"), required("b")],
    [{ kind: "added_required", name: "b" }],
  ],
  [
    "removed — roadmap rule 2; a caller keeps sending a value that is now ignored",
    [required("a"), required("b")],
    [required("a")],
    [{ kind: "removed", name: "b" }],
  ],
  [
    "became required — lost its default; the fourth kind, not in the roadmap's three",
    [optional("a")],
    [required("a")],
    [{ kind: "became_required", name: "a" }],
  ],
  ["became optional — gained a default; nobody breaks", [required("a")], [optional("a")], []],
  ["default value changed — a content change, graded by the check suite and not by this", [optional("a", "x")], [optional("a", "y")], []],
  [
    "description changed — documentation",
    [{ name: "a", defaultValue: null, description: "before" }],
    [{ name: "a", defaultValue: null, description: "after" }],
    [],
  ],
  [
    "type changed — roadmap rule 3; reserved in v1, so no v1 artifact can exhibit it",
    [required("a", "string")],
    [required("a", "number")],
    [{ kind: "type_changed", name: "a" }],
  ],
  [
    "type first appears — the reserved field starting to carry a value is a type change",
    [required("a")],
    [required("a", "string")],
    [{ kind: "type_changed", name: "a" }],
  ],
  [
    "renamed — reported as both halves, because that is what it does to a caller",
    [required("email")],
    [required("address")],
    [
      { kind: "added_required", name: "address" },
      { kind: "removed", name: "email" },
    ],
  ],
  [
    "one variable broken two ways — two problems for a caller, not one",
    [optional("a", "x", "string")],
    [required("a", "number")],
    [
      { kind: "became_required", name: "a" },
      { kind: "type_changed", name: "a" },
    ],
  ],
  [
    "several at once, reported in name order",
    [required("keep"), required("gone"), optional("loosen")],
    [required("keep"), required("loosen"), required("added")],
    [
      { kind: "added_required", name: "added" },
      { kind: "removed", name: "gone" },
      { kind: "became_required", name: "loosen" },
    ],
  ],
  [
    "declared in a different order — not a change at all",
    [required("b"), required("a")],
    [required("a"), required("b")],
    [],
  ],
  [
    "an empty-string default is a default, so it is optional",
    [optional("a", "")],
    [optional("a", "")],
    [],
  ],
  [
    "an empty-string default removed is a break, which is the case a truthiness test gets wrong",
    [optional("a", "")],
    [required("a")],
    [{ kind: "became_required", name: "a" }],
  ],
];

describe("isCompatible", () => {
  it.each(MATRIX)("%s", (_name, before, after, expected) => {
    expect(breaksBetween(before, after)).toEqual(expected);
  });

  it("says compatible exactly when there are no breaks", () => {
    expect(isCompatible(withVariables([required("a")]), withVariables([required("a"), optional("b")])).compatible).toBe(true);
    expect(isCompatible(withVariables([required("a")]), withVariables([])).compatible).toBe(false);
  });

  /**
   * The question is about the calling contract, not about whether the new prompt is any good.
   * Whether it is any good is the check suite, and `CLAUDE.md` rule 9 is the gate for that.
   */
  it("ignores everything except the declarations", () => {
    const one = artifactOf({ promptId: "pr_0000beef", compiled: compile(BLOKS), bloks: BLOKS, model: "claude-sonnet-5" });
    const other = artifactOf({
      promptId: "pr_0000cafe",
      compiled: compile([{ id: "z", kind: "constraint", order: 1, text: "Something entirely different." }]),
      bloks: [{ id: "z", kind: "constraint", order: 1, text: "Something entirely different." }],
      model: "gemini-2.5-pro",
      params: { temperature: 1 },
    });
    expect(isCompatible(one, other).compatible).toBe(true);
  });

  it("reports breaks in a deterministic order whatever order the declarations arrived in", () => {
    const before = [required("zulu"), required("alpha")];
    const after: readonly ArtifactVariable[] = [];
    expect(breaksBetween(before, after)).toEqual(breaksBetween([...before].reverse(), after));
    expect(breaksBetween(before, after).map((one) => one.name)).toEqual(["alpha", "zulu"]);
  });
});
