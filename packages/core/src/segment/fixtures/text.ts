// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

// Every corpus prompt is built line by line rather than as one template literal. In a fixture
// corpus for a segmenter, the line structure *is* the fixture: where the blank lines fall and
// which line ending is in use decide the whole result, and neither is visible in a template
// literal. Building from a line list also lets a fence fixture contain a real ``` without
// escaping, and makes "no trailing newline" an explicit choice rather than an accident.

/** Join lines with `\n`. A final `""` gives the prompt a trailing newline. */
export function lf(...lines: string[]): string {
  return lines.join("\n");
}

/** Join lines with `\r\n`, as a prompt pasted out of a Windows editor arrives. */
export function crlf(...lines: string[]): string {
  return lines.join("\r\n");
}

/** Join lines with a lone `\r`, the line ending nobody plans for. */
export function cr(...lines: string[]): string {
  return lines.join("\r");
}
