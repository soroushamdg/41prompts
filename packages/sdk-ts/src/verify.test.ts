// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { ARTIFACT_SCHEMA_VERSION } from "@41prompts/core";
import { build } from "./__fixtures__/artifacts.js";
import { checkArtifact, readArtifact, readMarker } from "./verify.js";

describe("readArtifact", () => {
  /**
   * The positive control, and it is first on purpose.
   *
   * Every other test in this file asserts a refusal, and a refusal is exactly the assertion that
   * passes when the instrument is broken — `docs/epics/HANDOVER.md` lesson 8, and lesson 13's false
   * negative. If this one ever fails, none of the others below mean anything.
   */
  it("accepts an artifact that matches its own content address", () => {
    const { artifactText, artifact } = build();
    const read = readArtifact(artifactText, artifact.buildHash);
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.value.buildHash).toBe(artifact.buildHash);
  });

  it("refuses an artifact whose body was changed after it was addressed", () => {
    const { artifactText } = build();
    // One character of the compiled text. The stored `buildHash` is untouched, which is exactly what
    // a tampered or truncated object looks like.
    const tampered = artifactText.replace("support agent", "support agenT");
    expect(tampered).not.toBe(artifactText);

    const read = readArtifact(tampered);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.warning.code).toBe("hash_mismatch");
  });

  it("refuses an intact artifact that is not the one the Live marker names", () => {
    const first = build({ body: "Version one for {{customer_name}}, {{tone}}." });
    const second = build({ body: "Version two for {{customer_name}}, {{tone}}." });
    expect(first.artifact.buildHash).not.toBe(second.artifact.buildHash);

    // The document is perfect. It is last week's. This is the stale-CDN case, and it is the one
    // nothing else catches, because every property of the document itself checks out.
    const read = readArtifact(first.artifactText, second.artifact.buildHash);
    expect(read.ok).toBe(false);
    if (!read.ok) {
      expect(read.warning.code).toBe("hash_mismatch");
      expect(read.warning.message).toContain("not the one the Live marker names");
    }
    // The control: the same bytes, against their own hash, are accepted.
    expect(readArtifact(first.artifactText, first.artifact.buildHash).ok).toBe(true);
  });

  it("refuses a schemaVersion it was written before, and says to upgrade", () => {
    const { artifact } = build();
    const future = { ...artifact, schemaVersion: ARTIFACT_SCHEMA_VERSION + 1 };
    const read = checkArtifact(future);
    expect(read.ok).toBe(false);
    if (!read.ok) {
      expect(read.warning.code).toBe("unknown_version");
      expect(read.warning.message).toContain("upgrade @41prompts/sdk");
    }
  });

  it("refuses text that is not JSON, and JSON that is not an artifact", () => {
    expect(readArtifact("<html>502 Bad Gateway</html>").ok).toBe(false);
    expect(readArtifact("[]").ok).toBe(false);
    expect(readArtifact("null").ok).toBe(false);
    expect(readArtifact('{"schemaVersion":1}').ok).toBe(false);
  });

  it("refuses a Map, a class instance and an array, which Object.keys cannot tell apart", () => {
    // EPIC-050 lesson 14: `typeof x === "object"` is true of all of these and `Object.keys` of each
    // is `[]`, so a version check alone would read them as a v0 artifact rather than as not one.
    class NotAnArtifact {}
    for (const value of [new Map(), new Set(), new NotAnArtifact(), [], /x/]) {
      expect(checkArtifact(value).ok).toBe(false);
    }
  });
});

describe("readMarker", () => {
  it("accepts a marker this SDK wrote the reader for", () => {
    const { markerText, marker } = build();
    const read = readMarker(markerText);
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.value.buildHash).toBe(marker.buildHash);
  });

  it("refuses a marker from a format this reader does not know", () => {
    const { marker } = build();
    const read = readMarker(JSON.stringify({ ...marker, schemaVersion: 99 }));
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.warning.code).toBe("unknown_version");
  });

  it("refuses a marker missing the fields a reader has to have", () => {
    const { marker } = build();
    for (const key of ["promptId", "buildHash", "version", "publishedAt"] as const) {
      const { [key]: _dropped, ...rest } = marker;
      expect(readMarker(JSON.stringify(rest)).ok).toBe(false);
    }
    // The control: nothing dropped, accepted.
    expect(readMarker(JSON.stringify(marker)).ok).toBe(true);
  });
});
