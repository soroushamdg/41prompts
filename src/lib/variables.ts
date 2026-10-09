/** {{variables}} inside blok text. Names are letters, digits and underscores. */
export const VARIABLE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/** Distinct variable names in order of first appearance. */
export function findVariables(...texts: string[]): string[] {
  const seen = new Set<string>();
  for (const t of texts) for (const m of t.matchAll(VARIABLE)) seen.add(m[1]!);
  return [...seen];
}

/** Splits text into plain runs and variable tokens, for painting pills. */
export function splitVariables(text: string): Array<{ text: string; variable?: string }> {
  const out: Array<{ text: string; variable?: string }> = [];
  let last = 0;
  for (const m of text.matchAll(VARIABLE)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[0], variable: m[1]! });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
