#!/usr/bin/env tsx
// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { getVersionOutput } from "./version.js";

const args = process.argv.slice(2);

if (args.includes("--version") || args.includes("-v")) {
  console.log(getVersionOutput());
} else {
  console.log(`41p ${getVersionOutput()}`);
}
