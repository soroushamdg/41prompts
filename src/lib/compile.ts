import { BLOK_LABEL, type Blok, type BlokType } from "./bloks";
import { VARIABLE, findVariables } from "./variables";

/* The compiled prompt (M04): every non-expects blok, in order, joined by a
   blank line. Shown as a template or with variables filled. Expects bloks
   never reach it. The segment map lets the editor highlight which blok owns
   which span. */

export type Part = { text: string; variable?: string; filled?: boolean };
export type Segment = { id: string; type: BlokType; parts: Part[]; text: string };
export type Compiled = { segments: Segment[]; text: string; chars: number; tokens: number; variables: string[] };

/** A blok's text as it goes into the prompt: trimmed, at most one blank line in a row. */
export function blokText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function compile(bloks: Blok[], mode: "template" | "filled" = "template", values: Record<string, string> = {}): Compiled {
  const segments: Segment[] = [];
  for (const b of bloks) {
    if (b.type === "expects") continue;
    const t = blokText(b.text);
    if (!t) continue;
    const parts: Part[] = [];
    let last = 0;
    let out = "";
    for (const m of t.matchAll(VARIABLE)) {
      const name = m[1]!;
      if (m.index! > last) parts.push({ text: t.slice(last, m.index) });
      const value = mode === "filled" ? values[name]?.trim() : undefined;
      parts.push({ text: value || m[0], variable: name, filled: Boolean(value) });
      last = m.index! + m[0].length;
    }
    if (last < t.length) parts.push({ text: t.slice(last) });
    out = parts.map((p) => p.text).join("");
    segments.push({ id: b.id, type: b.type, parts, text: out });
  }
  const text = segments.map((s) => s.text).join("\n\n");
  return { segments, text, chars: text.length, tokens: Math.round(text.length / 4), variables: findVariables(...bloks.map((b) => b.text)) };
}

/** "Copy as Markdown": every blok, including expects, under its type and ID. */
export function toMarkdown(name: string, bloks: Blok[]): string {
  return `# ${name}\n\n` + bloks.map((b) => `## ${BLOK_LABEL[b.type]} (${b.id})\n\n${blokText(b.text)}`).join("\n\n");
}

/** "Copy as JSON": the name, the version and every blok. */
export function toJson(name: string, version: number, bloks: Blok[]): string {
  return JSON.stringify({ name, version, bloks: bloks.map((b) => ({ id: b.id, type: b.type, text: blokText(b.text) })) }, null, 2);
}

/** "≈ 186 tokens · 742 chars" */
export function countLabel(c: Pick<Compiled, "tokens" | "chars">): string {
  return `≈ ${c.tokens.toLocaleString("en-US")} tokens · ${c.chars.toLocaleString("en-US")} chars`;
}
