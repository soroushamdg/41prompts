#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

// `npx 41p`, which is what a person types. Everything is in `@41prompts/cli`; this exists so the
// unscoped name resolves to it. See this package's README for why it is a wrapper and not the CLI.
import { main } from "@41prompts/cli";

await main();
