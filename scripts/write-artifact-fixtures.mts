// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
//
// Writes the golden artifact and Live marker fixtures that `frozen.test.ts` compares against.
//
//     pnpm exec tsx scripts/write-artifact-fixtures.mts
//
// **Run this by hand, deliberately, and read the diff.** It is a script and not a test because a
// test that regenerates its own expected value asserts nothing — `docs/PROCESS.md`'s "A test suite
// never writes into the working tree" is the rule, and the golden-fixture case is the sharpest
// instance of it: the whole point of these two files is that they fail when the bytes move.
//
// **When a run of this produces a diff, that diff is a decision, not a chore.** The artifact format
// is frozen (ADR-005). Bytes moving means either the compiler changed what it emits — in which case
// `COMPILER_VERSION` has already moved and the artifact legitimately differs — or the format itself
// changed, in which case `ARTIFACT_SCHEMA_VERSION` has to move with it and ADR-005 gains a section.
// Regenerating to make a red test green is the one use this script must not be put to.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../packages/core/src/artifact/canonical.js";
import { fixtureArtifact, fixtureLiveMarker } from "../packages/core/src/artifact/fixtures/inputs.js";

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "packages", "core", "src", "artifact", "fixtures");

const artifact = fixtureArtifact();
const marker = fixtureLiveMarker();

// Written as canonical bytes, with a trailing newline so each file is a well-formed text file; the
// test strips exactly that newline. Pretty-printing would be friendlier to read and would stop the
// file being the thing it is — a record of the bytes that are hashed.
writeFileSync(join(out, "artifact-v1.json"), `${canonicalJson(artifact as never)}\n`);
writeFileSync(join(out, "live-marker-v1.json"), `${canonicalJson(marker as never)}\n`);

console.log(`wrote artifact-v1.json      buildHash ${artifact.buildHash}`);
console.log(`wrote live-marker-v1.json   names     ${marker.buildHash}`);
