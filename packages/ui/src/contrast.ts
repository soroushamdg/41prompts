/**
 * WCAG 2.1 contrast checking for the token pairs our components actually produce. Not every
 * mathematically possible token pair — `--line` is a decorative hairline divider, never text, so
 * it isn't checked against anything here (a hairline in a design that reads "quiet, understated
 * structure" is not a contrast bug).
 */

export type Tokens = Record<string, string>;

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

export function contrastRatio(hexA: string, hexB: string): number {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

export interface ContrastPair {
  fg: string;
  bg: string;
  /** WCAG AA: 4.5 for normal text, 3.0 for large text / UI-component boundaries. */
  minRatio: 4.5 | 3.0;
  note: string;
}

/** Every text-on-background combination a shipped component actually renders. */
export const CONTRAST_PAIRS: ContrastPair[] = [
  { fg: "ink", bg: "bg", minRatio: 4.5, note: "body text on the page background" },
  { fg: "ink", bg: "surface", minRatio: 4.5, note: "body text on a card" },
  { fg: "ink", bg: "sunken", minRatio: 4.5, note: "body text on a sunken panel (compiled prompt, canvas)" },
  { fg: "ink2", bg: "bg", minRatio: 4.5, note: "secondary text on the page background" },
  { fg: "ink2", bg: "surface", minRatio: 4.5, note: "secondary text on a card" },
  // ink-3 is tertiary label chrome (eyebrows, table headers, KPI keys, unselected tab labels,
  // meta rows) and is genuinely placed on bg, surface, and sunken by shipped components (an
  // unselected Tab label sits directly on bare `bg`). Both themes' values were nudged from the
  // mockup's literal hex — axe-core flagged the unmodified values as real "serious" contrast
  // failures (light 4.03:1 on bg, dark 4.485:1 on surface); see tokens.css's comments and the
  // report. Held to full 4.5:1 normal-text AA on all three, not the relaxed 3:1 UI tier.
  { fg: "ink3", bg: "bg", minRatio: 4.5, note: "tertiary label (e.g. an unselected Tab) on the page background" },
  { fg: "ink3", bg: "surface", minRatio: 4.5, note: "tertiary label on a card" },
  { fg: "ink3", bg: "sunken", minRatio: 4.5, note: "tertiary label on a sunken panel" },
  { fg: "pass", bg: "passSoft", minRatio: 4.5, note: "Badge/Callout pass text on its own soft fill" },
  { fg: "fail", bg: "failSoft", minRatio: 4.5, note: "Badge/Callout fail text on its own soft fill" },
  { fg: "warn", bg: "warnSoft", minRatio: 4.5, note: "Badge/Callout drift text on its own soft fill" },
  { fg: "pass", bg: "surface", minRatio: 4.5, note: "Table cell-pass text on a card" },
  { fg: "fail", bg: "surface", minRatio: 4.5, note: "Table cell-fail text on a card" },
  { fg: "warn", bg: "surface", minRatio: 4.5, note: "Table cell-drift text on a card" },
  { fg: "focus", bg: "surface", minRatio: 3.0, note: "focus ring against a card (UI-component boundary)" },
  { fg: "focus", bg: "bg", minRatio: 3.0, note: "focus ring against the page background (UI-component boundary)" },
];

export interface ContrastResult extends ContrastPair {
  ratio: number;
  pass: boolean;
}

export function checkContrast(tokens: Tokens, pairs: ContrastPair[] = CONTRAST_PAIRS): ContrastResult[] {
  return pairs.map((pair) => {
    const fgHex = tokens[pair.fg];
    const bgHex = tokens[pair.bg];
    if (!fgHex || !bgHex) {
      throw new Error(`contrast pair references unknown token: ${pair.fg} / ${pair.bg}`);
    }
    const ratio = contrastRatio(fgHex, bgHex);
    return { ...pair, ratio, pass: ratio >= pair.minRatio };
  });
}

/** Extracts `--name: #hex;` pairs from a `:root{...}` or `[data-theme=dark]{...}` block's raw
 * CSS text (case- and whitespace-tolerant; ignores non-colour values like spacing/radius). Keys
 * are camelCased (`--pass-soft` -> `passSoft`) to match `CONTRAST_PAIRS`. */
export function parseColorTokens(cssBlockBody: string): Tokens {
  const tokens: Tokens = {};
  const re = /--color-([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(cssBlockBody))) {
    const name = match[1]!.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
    tokens[name] = match[2]!;
  }
  return tokens;
}
