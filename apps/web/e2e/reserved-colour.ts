/**
 * The one probe for `CLAUDE.md` rule 10: green, red and amber mean pass, fail and drift, and
 * nothing else may use them.
 *
 * ## Why this file exists, and it is not tidiness
 *
 * There were **four copies** of this probe — `landing.spec.ts`, `soft-ship.spec.ts`,
 * `decompile.spec.ts`, `capture-share.spec.ts` — and every one of them carried the same defect:
 *
 * ```js
 * const values = ["--color-pass", …].map((t) => styles.getPropertyValue(t).trim());  // "#0b5c2e"
 * if (values.some((value) => computed[property] === value)) bad.push(…);             // "rgb(11, 92, 46)"
 * ```
 *
 * `getPropertyValue` on a custom property returns **the declared text**, which `tokens.css` writes
 * as hex. `getComputedStyle(el).color` returns the **computed** value, which every browser
 * serialises as `rgb(…)`. The two are never equal, so `bad` could not be appended to and all four
 * tests asserted `[] === []`.
 *
 * They have therefore been passing without checking anything since EPIC-016, across four routes and
 * every epic in between. Found in EPIC-016c, by writing the positive control that
 * `CLAUDE.md` asks for on every absence assertion and watching it fail to fire.
 *
 * **That is the reason this is a module and not four corrected copies.** The bug was not subtle
 * once seen; it was invisible four times because nobody reads a passing test. One implementation
 * has one positive control (`reserved-colour.spec.ts`), and there is no fifth copy to get wrong.
 *
 * ## `exempt`
 *
 * The home page's marked examples, and only those. Soroush's ruling of 2026-09-21 (EPIC-016c):
 * inside a `<figure class="example">` the reserved hues mean **exactly** pass and fail, because
 * what is inside one is a picture of the product's own interface. Rule 10 is about meaning, and a
 * suite result drawn in ink would be showing a verdict in a colour the product does not use for
 * verdicts. Outside a marked example nothing is exempt, on any route.
 */

export interface ReservedColourQuery {
  /** The elements to read. `"body *"` for a whole page; a route's own root for a route. */
  readonly selector: string;
  /** The colour properties to read. Border sides differ by route, so each caller names its own. */
  readonly properties: readonly string[];
  /** A selector whose subtree is exempt, or omitted for none. `"figure.example"` on the home page. */
  readonly exempt?: string;
}

/**
 * Every element under `selector` painting a reserved hue, as `class:property=value`.
 *
 * **Runs inside the page** — `page.evaluate(reservedColourOffenders, query)` serialises it by
 * source, so it closes over nothing and every value it needs is constructed here.
 */
export function reservedColourOffenders({ selector, properties, exempt }: ReservedColourQuery): string[] {
  const styles = getComputedStyle(document.documentElement);

  /**
   * Both sides of the comparison through the same serialiser.
   *
   * The token is declared text (`#0b5c2e`); `getComputedStyle` answers in `rgb(…)`. Assigning the
   * token to a real element and reading it back is the browser's own conversion, which is the only
   * one guaranteed to match what it will report for the elements under test — a hand-written
   * hex-to-rgb would have to track `color-mix`, `oklch` and whatever `tokens.css` uses next.
   */
  const probe = document.createElement("span");
  probe.style.display = "none";
  document.body.append(probe);
  function normalise(declared: string): string | undefined {
    probe.style.color = "";
    probe.style.color = declared;
    // An invalid value leaves the property unset, and reading the computed colour then returns the
    // inherited ink — which would match half the page. Refuse it instead.
    if (probe.style.color === "") return undefined;
    return getComputedStyle(probe).color;
  }

  const reserved = new Set<string>();
  for (const token of ["--color-pass", "--color-fail", "--color-warn"]) {
    for (const name of [token, `${token}-soft`]) {
      const declared = styles.getPropertyValue(name).trim();
      if (!declared) continue;
      const value = normalise(declared);
      if (value) reserved.add(value);
    }
  }

  const bad: string[] = [];
  if (reserved.size > 0) {
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      if (element === probe) continue;
      // `closest` rather than a subtree walk: it answers the question the exemption actually asks —
      // is this element *inside* something the page has marked as a picture of the product.
      if (exempt && element.closest(exempt)) continue;
      const computed = getComputedStyle(element) as unknown as Record<string, string>;
      for (const property of properties) {
        const used = computed[property];
        if (used && reserved.has(used)) bad.push(`${element.className}:${property}=${used}`);
      }
    }
  }

  probe.remove();
  // An empty `reserved` means the tokens could not be read at all, which is a broken probe rather
  // than a clean page — and a broken probe reporting "clean" is the whole reason this file exists.
  return reserved.size === 0 ? ["reserved colour tokens could not be read from :root"] : bad;
}
