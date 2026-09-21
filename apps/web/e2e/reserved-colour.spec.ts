import { expect, test } from "@playwright/test";
import { reservedColourOffenders } from "./reserved-colour";

/**
 * The positive control for the rule-10 probe, which is the thing that did not exist.
 *
 * ## What went wrong, so the shape is recognisable next time
 *
 * Four specs asserted "this route uses no pass, fail or drift colour" by comparing
 * `getPropertyValue("--color-pass")` — declared text, `#0b5c2e` — against
 * `getComputedStyle(el).color` — a computed value, `rgb(11, 92, 46)`. Those are never equal, so the
 * offender list could not be appended to and every one of the four asserted `[] === []`.
 *
 * They had been green since EPIC-016 and were quoted in epic reports as evidence that the pages
 * obeyed rule 10. **`CLAUDE.md` already had the rule that would have caught it**: every absence
 * assertion needs a positive control. Four absence assertions were written without one, and the
 * defect was found in EPIC-016c the first time somebody wrote the control.
 *
 * ## What this file does about it
 *
 * `reserved-colour.ts` is now the one implementation, and these are its controls. They run against
 * `/` because it is a real page with the tokens on it, and they paint the hue themselves rather
 * than relying on any page to be wrong — a control that needs a defect to exist is not a control.
 *
 * Four directions, and each one is a way the probe could go quietly wrong:
 *
 * 1. it reports a reserved hue where there is one;
 * 2. it reports nothing on a page that has none outside its exemption;
 * 3. the exemption actually exempts, so narrowing it was a real change;
 * 4. the exemption does not leak — a reserved hue just outside a marked example is still caught.
 */

const PROPERTIES = ["color", "backgroundColor", "borderTopColor", "borderBottomColor"] as const;

test.describe("the reserved-colour probe", () => {
  test("reports an element painted a reserved hue", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      const fail = getComputedStyle(document.documentElement).getPropertyValue("--color-fail").trim();
      document.querySelector<HTMLElement>("h2.home-h2")!.style.color = fail;
    });
    const offenders = await page.evaluate(reservedColourOffenders, {
      selector: "body *",
      properties: [...PROPERTIES],
      exempt: "figure.example"
    });
    expect(offenders.join(" "), "the probe did not see --color-fail on a heading").toContain("home-h2:color");
  });

  test("reports a reserved background, not only a reserved text colour", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      const soft = getComputedStyle(document.documentElement).getPropertyValue("--color-warn-soft").trim();
      document.querySelector<HTMLElement>("h2.home-h2")!.style.backgroundColor = soft;
    });
    const offenders = await page.evaluate(reservedColourOffenders, {
      selector: "body *",
      properties: [...PROPERTIES],
      exempt: "figure.example"
    });
    expect(offenders.join(" ")).toContain("home-h2:backgroundColor");
  });

  test("reports nothing on the page as it ships", async ({ page }) => {
    await page.goto("/");
    const offenders = await page.evaluate(reservedColourOffenders, {
      selector: "body *",
      properties: [...PROPERTIES],
      exempt: "figure.example"
    });
    expect(offenders).toEqual([]);
  });

  /**
   * The exemption is doing something. Without this, "no reserved colour outside a marked example"
   * and "no reserved colour anywhere" would be indistinguishable on a page that happened to have
   * none inside one — and the ruling this epic is built on would be untested.
   */
  test("the exemption changes the answer", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Test" }).click();
    const withExemption = await page.evaluate(reservedColourOffenders, {
      selector: "body *",
      properties: [...PROPERTIES],
      exempt: "figure.example"
    });
    const without = await page.evaluate(reservedColourOffenders, {
      selector: "body *",
      properties: [...PROPERTIES]
    });
    expect(withExemption).toEqual([]);
    expect(without.length, "no reserved colour inside a marked example, so the exemption is idle").toBeGreaterThan(0);
  });

  /**
   * And the exemption does not leak upward. `closest` is the reason it cannot — an element outside
   * every `<figure class="example">` has no such ancestor however many of them the page holds — but
   * "the implementation makes that impossible" is an argument, and this is the measurement.
   */
  test("does not exempt an element that merely sits near a marked example", async ({ page }) => {
    await page.goto("/");
    const painted = await page.evaluate(() => {
      const fail = getComputedStyle(document.documentElement).getPropertyValue("--color-fail").trim();
      const figure = document.querySelector<HTMLElement>("figure.example");
      if (!figure?.parentElement) return false;
      // The figure's own parent: as close to an example as an element can be without being in one.
      figure.parentElement.classList.add("probe-sibling");
      figure.parentElement.style.color = fail;
      return true;
    });
    expect(painted, "the page has no marked example to sit beside").toBe(true);
    const offenders = await page.evaluate(reservedColourOffenders, {
      selector: "body *",
      properties: [...PROPERTIES],
      exempt: "figure.example"
    });
    expect(offenders.join(" ")).toContain("probe-sibling");
  });

  /** A probe that cannot read the tokens must say so rather than report a clean page — the exact
   *  failure mode this whole file exists to make impossible. */
  test("says so rather than reporting clean when the tokens cannot be read", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      for (const token of ["--color-pass", "--color-fail", "--color-warn"]) {
        for (const name of [token, `${token}-soft`]) document.documentElement.style.setProperty(name, "");
        for (const name of [token, `${token}-soft`]) document.documentElement.style.setProperty(name, "not-a-colour");
      }
    });
    const offenders = await page.evaluate(reservedColourOffenders, {
      selector: "body *",
      properties: [...PROPERTIES],
      exempt: "figure.example"
    });
    expect(offenders).toEqual(["reserved colour tokens could not be read from :root"]);
  });
});
