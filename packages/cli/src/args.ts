// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * argv, parsed by hand (EPIC-053).
 *
 * ## Why not a parsing library
 *
 * `CLAUDE.md` rule 11: a public package imports only the other public packages, Node builtins, or
 * its own declared dependencies — and every dependency a CLI declares is one a customer installs.
 * `@41prompts/sdk` ships zero dependencies as a promise (ADR-006); a CLI beside it that pulled in
 * three transitive trees to read `--key` would be an odd companion.
 *
 * The surface is small enough that this is about eighty lines: five commands, eight flags, no
 * sub-sub-commands, no shorthand clustering. If it grows a completion script or a config schema,
 * that is the moment to reconsider — not before.
 *
 * ## Unknown flags are refused rather than ignored
 *
 * `41p pull --langauge python` typed at midnight silently pulls TypeScript if unknown flags are
 * dropped. It exits `2` instead, naming the flag. The shell's own convention for misuse, and the
 * same category as an unknown command: the question could not be put.
 */

export interface ParsedArgs {
  readonly command: string | undefined;
  /** Everything that was not a flag or a flag's value, in order. */
  readonly positional: readonly string[];
  readonly flags: Readonly<Record<string, string | boolean>>;
}

export type ParseOutcome =
  | { readonly ok: true; readonly args: ParsedArgs }
  | { readonly ok: false; readonly detail: string };

/** Flags that take a value. Everything else is a switch. */
const VALUED = new Set(["key", "base-url", "out", "lang", "var", "file"]);
const SWITCHES = new Set(["json", "help", "version"]);

export function parseArgs(argv: readonly string[]): ParseOutcome {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  const vars = new Map<string, string>();

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;

    if (token === "-h") {
      flags.help = true;
      continue;
    }
    if (token === "-v") {
      flags.version = true;
      continue;
    }
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }

    const body = token.slice(2);
    const eq = body.indexOf("=");
    const name = eq === -1 ? body : body.slice(0, eq);
    const inline = eq === -1 ? undefined : body.slice(eq + 1);

    if (SWITCHES.has(name)) {
      if (inline !== undefined) return { ok: false, detail: `--${name} takes no value` };
      flags[name] = true;
      continue;
    }
    if (!VALUED.has(name)) {
      return { ok: false, detail: `unknown flag --${name}` };
    }

    const value = inline ?? argv[++i];
    if (value === undefined) return { ok: false, detail: `--${name} needs a value` };

    if (name === "var") {
      // `--var name=value`, repeatable. The first `=` splits it, so a value may contain one.
      const split = value.indexOf("=");
      if (split <= 0) return { ok: false, detail: `--var wants name=value, got ${value}` };
      vars.set(value.slice(0, split), value.slice(split + 1));
      continue;
    }
    flags[name] = value;
  }

  if (vars.size > 0) flags.var = serialiseVars(vars);

  const [command, ...rest] = positional;
  return { ok: true, args: { command, positional: rest, flags } };
}

/**
 * `--var` is repeatable, and `flags` holds one value per name, so the pairs are carried as JSON and
 * unpacked by `varsOf`. Stringifying rather than widening `flags` keeps the parser's output a flat
 * record of scalars, which is what makes it trivial to assert in a test.
 */
const serialiseVars = (vars: ReadonlyMap<string, string>): string => JSON.stringify([...vars]);

export function varsOf(flags: Readonly<Record<string, string | boolean>>): ReadonlyMap<string, string> {
  const raw = flags.var;
  if (typeof raw !== "string") return new Map();
  return new Map(JSON.parse(raw) as [string, string][]);
}

/** A flag's value when it is a string, or undefined. Never a boolean leaking into a value slot. */
export const stringFlag = (
  flags: Readonly<Record<string, string | boolean>>,
  name: string,
): string | undefined => (typeof flags[name] === "string" ? (flags[name] as string) : undefined);

export function languageFlag(
  flags: Readonly<Record<string, string | boolean>>,
): { ok: true; value: "typescript" | "python" | undefined } | { ok: false; detail: string } {
  const raw = stringFlag(flags, "lang");
  if (raw === undefined) return { ok: true, value: undefined };
  if (raw === "ts" || raw === "typescript") return { ok: true, value: "typescript" };
  if (raw === "py" || raw === "python") return { ok: true, value: "python" };
  return { ok: false, detail: `--lang wants typescript or python, got ${raw}` };
}
