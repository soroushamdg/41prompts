// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical.js";
import { fixtureArtifact, fixtureLiveMarker } from "./fixtures/inputs.js";
import { artifactBytes, buildHashOf } from "./schema.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const read = (name: string): string => readFileSync(join(FIXTURES, name), "utf-8").replace(/\n$/, "");

/**
 * **The golden files. This is the test the epic is for.**
 *
 * Every other test in this directory is written against the implementation's own output, so all of
 * them would pass together on a format that had quietly changed. These two files were written once,
 * by `scripts/write-artifact-fixtures.mts`, read by a person, and committed. They are the only thing
 * here that can say *the bytes moved*.
 *
 * ## What to do when one of these fails
 *
 * **Not regenerate it.** A failure is one of three things and each has a different answer:
 *
 * 1. **The compiler changed what it emits.** `COMPILER_VERSION` has moved, the compiled text
 *    legitimately differs, and the fixture is regenerated *after* that is confirmed — the artifact
 *    format did not change, its input did.
 * 2. **The format changed.** A field added, removed, renamed or re-typed; a different canonical
 *    encoding; a different digest. `ARTIFACT_SCHEMA_VERSION` has to move, ADR-005 gains a section,
 *    and every shipped SDK has to be able to refuse the new version cleanly. This is not a commit.
 * 3. **Something is wrong.** A non-deterministic value crept into the assembly, a sort became
 *    unstable, a hash is being taken over the wrong bytes. This is the case the file exists for.
 *
 * Regenerating to make a red test green turns all three into the third, silently.
 */
describe("the frozen artifact fixture", () => {
  it("is byte-for-byte what artifactOf produces today", () => {
    expect(artifactBytes(fixtureArtifact())).toBe(read("artifact-v1.json"));
  });

  /**
   * The digest, separately and by value. The bytes matching would already imply it, but a hash
   * written out in full is the thing a reader can copy into another language's implementation and
   * check — `sdks/python` (EPIC-054) will do exactly that, and this line is its test vector.
   */
  it("has the build hash recorded here in full, as a vector another language can check", () => {
    expect(fixtureArtifact().buildHash).toBe("67fa58281746e54b750529c1ed35182d0dbe9fdeb5a289cb25783c63c9190d55");
  });

  it("re-derives its own hash from the committed bytes", () => {
    const parsed = JSON.parse(read("artifact-v1.json")) as ReturnType<typeof fixtureArtifact>;
    expect(buildHashOf(parsed)).toBe(parsed.buildHash);
  });

  /**
   * The committed file is canonical, not merely equal. A fixture written with `JSON.stringify` would
   * parse to the same value and prove nothing about the encoding the hash is taken over.
   */
  it("is stored in canonical form, so the file is the bytes and not a rendering of them", () => {
    const text = read("artifact-v1.json");
    expect(canonicalJson(JSON.parse(text) as never)).toBe(text);
    expect(text).not.toContain("\n");
  });
});

describe("the frozen Live marker fixture", () => {
  it("is byte-for-byte what liveMarkerOf produces today", () => {
    expect(canonicalJson(fixtureLiveMarker() as never)).toBe(read("live-marker-v1.json"));
  });

  it("names the artifact fixture, so the pair is a consistent published state", () => {
    expect(fixtureLiveMarker().buildHash).toBe(fixtureArtifact().buildHash);
  });
});
