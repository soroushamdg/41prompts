// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * `@41prompts/cli`'s module surface (EPIC-053).
 *
 * The package is a binary first — `41p` — and this exists so the drive and the tests can run a
 * command without spawning a process, and so the unscoped `41p` wrapper has something to import.
 * Nothing here is a frozen public API the way ADR-006 freezes the SDK's; it is the CLI's own shape.
 */

export { main, runCommand } from "./main.js";
export { EXIT, type CommandResult, type ExitCode } from "./exit.js";
export { nodeEnv, type Env } from "./out.js";
export { COMMANDS, HELP, type CommandName } from "./help.js";
export { VERSION, getVersionOutput } from "./version.js";
export { CONFIG_FILENAME } from "./config.js";
export { LOCKFILE_FILENAME } from "./lockfile.js";
export { BUNDLE_DIR } from "./commands/pull.js";
