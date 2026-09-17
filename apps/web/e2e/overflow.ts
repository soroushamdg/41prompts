import { expect, type Page } from "@playwright/test";

/**
 * Assert nothing overflows the viewport horizontally, **and name what does when something does**.
 *
 * A bare `scrollWidth - innerWidth <= 1` tells you a page is 56px too wide and nothing else, which
 * leaves whoever reads the failure to reproduce it by hand before they can start. This returns the
 * offending elements with their class names, so the failure is the diagnosis.
 *
 * `right > width + 1` rather than `> width`: sub-pixel layout rounding puts elements a fraction over
 * the edge routinely, and a gate that fires on 0.5px is a gate somebody switches off.
 *
 * **An element inside a scrolling ancestor is skipped**, and that is not a convenience. A `<code>`
 * inside a `<pre overflow-x:auto>` is *meant* to be wider than the viewport — that is what the scroll
 * container is for — and `getBoundingClientRect` reports its full width regardless of the clipping.
 * The first version of this helper listed three such `<code>` elements above the one element that was
 * actually overflowing, which is a diagnosis that sends you to the wrong file.
 */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const found = await page.evaluate(() => {
    const width = window.innerWidth;
    const offenders: { tag: string; cls: string; right: number; width: number }[] = [];
    const scrolls = (element: Element): boolean => {
      for (let node = element.parentElement; node !== null; node = node.parentElement) {
        const overflowX = getComputedStyle(node).overflowX;
        if (overflowX === "auto" || overflowX === "scroll" || overflowX === "hidden") return true;
      }
      return false;
    };

    for (const element of document.querySelectorAll("*")) {
      const box = element.getBoundingClientRect();
      if (box.right > width + 1 && !scrolls(element)) {
        offenders.push({
          tag: element.tagName.toLowerCase(),
          cls: typeof element.className === "string" ? element.className : "",
          right: Math.round(box.right),
          width: Math.round(box.width),
        });
      }
    }
    return { overflow: document.documentElement.scrollWidth - width, offenders: offenders.slice(0, 8) };
  });

  expect(
    found.overflow,
    `page overflows by ${found.overflow}px. Widest elements past the edge:\n` +
      found.offenders.map((o) => `  ${o.tag}.${o.cls} — right ${o.right}, width ${o.width}`).join("\n"),
  ).toBeLessThanOrEqual(1);
}
