// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/** `41p --help`, and what an unknown command is answered with (EPIC-053). */

export const COMMANDS = ["link", "pull", "check", "run", "decompile"] as const;
export type CommandName = (typeof COMMANDS)[number];

export const isCommand = (value: string | undefined): value is CommandName =>
  value !== undefined && (COMMANDS as readonly string[]).includes(value);

export const HELP = [
  "41p — your prompts, in your repository.",
  "",
  "  41p link                     write .41prc and prove your key works",
  "  41p pull [--lang python]     write prompts.ts, the lockfile and the bundled builds",
  "  41p check                    is what you generated still what is Live? (for CI)",
  "  41p run <promptId> --var k=v print the prompt your program would send",
  "  41p decompile <file>         read a prompt file and say what is wrong with it",
  "",
  "Flags:",
  "  --key <key>        API key. Otherwise FORTYONE_API_KEY.",
  "  --base-url <url>   where /v1 lives. Otherwise FORTYONE_BASE_URL, then .41prc.",
  "  --out <dir>        where generated files go. Otherwise .41prc, then here.",
  "  --lang <language>  typescript (the default) or python.",
  "  --var name=value   a value for 41p run. Repeatable.",
  "  --json             machine-readable output, where a command has one.",
  "",
  "Exit codes:",
  "  0  it worked",
  "  1  a real negative answer — the lockfile is stale, a variable is missing",
  "  2  the question could not be put — no config, no key, a refusal, no network",
  "",
  "Your API key is never written to a file. Keep it in FORTYONE_API_KEY.",
] as const;
