// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
//
// Writes the two cross-language disk-cache fixtures (EPIC-054 ruling 5, C9).
//
//     pnpm exec tsx scripts/write-cross-language-cache.mts
//
// `@41prompts/sdk` and `fortyone-prompts` share one cache directory and one record shape. Each
// language's writer produces one file here and each language's suite reads the **other** one:
//
//   sdks/python/tests/cross-language/written-by-typescript.json  <- packages/sdk-ts, read by pytest
//   sdks/python/tests/cross-language/written-by-python.json      <- fortyone, read by disk.test.ts
//
// **Run it by hand and read the diff.** The files exist so that a change to the record shape on
// either side fails a test rather than quietly leaving two SDKs with separate caches in one
// directory — regenerating them to make a red test green is the one use this must not be put to.
// Both suites also assert that the committed file is what their own writer currently produces, so a
// fixture cannot drift away from the code while still satisfying the reader.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeToDisk } from "../packages/sdk-ts/src/disk.js";
import type { Artifact } from "@41prompts/core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "sdks", "python", "tests", "cross-language");
mkdirSync(out, { recursive: true });

const artifactText = readFileSync(
  join(root, "packages", "core", "src", "artifact", "fixtures", "artifact-v1.json"),
  "utf-8",
).trimEnd();
const artifact = JSON.parse(artifactText) as Artifact;

writeToDisk(
  out,
  "written-by-typescript",
  { artifact, version: 6, publishedAt: "2026-09-16T14:03:07Z", etag: '"from-typescript"' },
  artifactText,
  (warning) => {
    throw new Error(`the TypeScript writer warned: ${warning.message}`);
  },
);
console.log("wrote written-by-typescript.json");

// The Python half, through Python's own writer for the same reason: a fixture written by the reader
// proves nothing about the writer.
execFileSync(
  "uv",
  [
    "run",
    "--project",
    join(root, "sdks", "python"),
    "python",
    "-c",
    [
      "import json,sys",
      "from fortyone._disk import Entry, write_to_disk",
      "text = open(sys.argv[1], encoding='utf-8').read().rstrip('\\n')",
      "entry = Entry(build=json.loads(text), version=6, published_at='2026-09-16T14:03:07Z', etag='\"from-python\"')",
      "write_to_disk(sys.argv[2], 'written-by-python', entry, text, lambda w: (_ for _ in ()).throw(SystemExit(w.message)))",
    ].join("\n"),
    join(root, "packages", "core", "src", "artifact", "fixtures", "artifact-v1.json"),
    out,
  ],
  { stdio: "inherit", cwd: join(root, "sdks", "python") },
);
console.log("wrote written-by-python.json");
