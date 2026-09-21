import type { ReactNode } from "react";

/**
 * A picture of the product, marked as one.
 *
 * ## Why this is a component and not a caption
 *
 * Soroush's ruling of 2026-09-20 is that the mockup's illustrative sections ship **with obviously
 * labelled example data**. The mockup's home page carries about thirty figures — `40/40`, `81.7%`,
 * `1,284 tok`, `$0.0031` — and every one of them is a picture of a screen rather than a statement
 * about the product.
 *
 * `site-claims.test.tsx` has a rule that makes labelling load-bearing rather than decorative:
 *
 * > Every number on every page, justified. A digit that appears has to be explained, or this fails
 * > and somebody has to say what it is.
 *
 * Listing twenty run-demo figures in `EXPLAINED_NUMBERS` as "example data" would pass and would gut
 * the rule: the list stops being a set of facts about the product and becomes somewhere to put
 * anything inconvenient.
 *
 * **The precedent was already in that file.** It strips `<pre>` because *"a model id and a port
 * inside a snippet are part of the sample, not claims about the product"*. A number inside a
 * surface marked `Example` is the same kind of thing, so the numbers rule skips this container too.
 *
 * The consequence is the point: **example data is only renderable if it is labelled**, because an
 * unlabelled figure fails the build. The marker is the mechanism, not a nicety somebody can forget.
 *
 * ## What it does *not* get an exemption from
 *
 * Only the numbers rule. The denylist — `SOC 2`, `per seat`, `trusted by`, a customer count — still
 * runs over this text, and deliberately: a figure inside an illustration is sample data, and a
 * compliance claim inside an illustration is still a claim. `site-claims.test.tsx` carries a
 * control for each direction.
 *
 * ## `<figure>`, and a caption that says what it is a picture of
 *
 * An illustration with a caption is what `<figure>` and `<figcaption>` are for, so a screen reader
 * gets the same "this is an example of X" the eye does. `what` is that sentence and is required —
 * a marker reading only "Example" tells somebody it is not real without telling them what it is.
 *
 * `data-example="true"` sat on this element until EPIC-016c and was read by nothing — EPIC-016b's
 * report §8 item 2. `withoutExamples` matches on the class, and a second way to say the same thing
 * is a second thing that can drift.
 */
export function Example({ what, children }: { what: string; children: ReactNode }) {
  return (
    <figure className="example">
      <figcaption className="example-caption">
        <span className="example-mark">Example</span>
        <span className="example-what">{what}</span>
      </figcaption>
      <div className="example-body">{children}</div>
    </figure>
  );
}

/**
 * Remove every marked example from rendered markup.
 *
 * **Here rather than in a test**, because it encodes this component's contract and two different
 * guards need it — `page.test.tsx` for the home page and `site-claims.test.tsx` for the other six.
 * Two copies of this regex is two answers to "what counts as an example", and the one that drifts
 * is whichever page somebody is not looking at.
 */
export function withoutExamples(markup: string): string {
  return markup.replace(/<figure class="example"[\s\S]*?<\/figure>/g, " ");
}
