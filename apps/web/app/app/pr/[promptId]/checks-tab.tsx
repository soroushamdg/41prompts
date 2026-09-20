import { CHECK_KIND_PHRASES, type Check } from "@41prompts/core";

/**
 * The third of the mockup's four tabs (line 1115).
 *
 * ## It is called Checks, and the mockup calls it Assertions
 *
 * ADR-003 forbids "assertion" in UI strings and `docs/design/README.md` says to build "checks".
 * `workbench.tsx` has carried a note to whoever built this tab since EPIC-022, saying to meet that
 * before writing the label rather than after. Met.
 *
 * ## It reads; it does not write
 *
 * A check **is** an `expected` blok — `compile()` turns one into the other, which is the whole of
 * `CLAUDE.md`'s "expected bloks compile to checks, not text". Authoring one therefore means editing
 * that blok, which the canvas already does. A second editing surface for the same row is the
 * duplicate this repository has refused six times, and it would be the worse of the two copies:
 * the canvas has the blok's verbatim text and this has a derived view of it.
 *
 * So every row links back to the blok it came from, and the tab is a list.
 *
 * ## A check whose kind cannot be named says so
 *
 * `Check.kind` is optional and deliberately so: the kind is derived from `detect/rule-shapes.json`,
 * and when no shape matches there is **no honest answer**. Defaulting to `must_contain` would
 * assert a substring nobody wrote, and inventing a ninth kind would contradict ADR-003. The row
 * says the check exists and its kind is not one of the eight, which is true and useful — it is
 * exactly the blok to reword.
 */
export function ChecksTab({ checks }: { checks: readonly Check[] }) {
  if (checks.length === 0) {
    return (
      <p className="app-empty">
        No checks yet. An <strong>expected</strong> blok becomes a check rather than prompt text —
        add one on the Editor tab and it will appear here.
      </p>
    );
  }

  return (
    <div className="checks-tab">
      <p className="checks-tab-lede">
        {checks.length === 1 ? "One check" : `${checks.length} checks`}, compiled from this
        prompt&rsquo;s expected bloks. A run grades every one of them against the model&rsquo;s
        output.
      </p>

      <ol className="checks-list">
        {checks.map((check) => (
          <li key={check.id} className="checks-item">
            <p className="checks-item-kind">
              {check.kind === undefined ? (
                <span className="checks-item-unnamed">not one of the eight kinds</span>
              ) : (
                CHECK_KIND_PHRASES[check.kind]
              )}
            </p>
            {/* The blok's verbatim text. `CLAUDE.md` rule 3: never a paraphrase of what was written. */}
            <p className="checks-item-text">{check.text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
