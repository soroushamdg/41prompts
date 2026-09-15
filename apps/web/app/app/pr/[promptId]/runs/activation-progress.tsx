import { activationDone, type ActivationStep } from "@/lib/activation/progress";

/**
 * Where the person is in the activation journey, on the example prompt only.
 *
 * ## Why it appears on the example and nowhere else
 *
 * It is onboarding, not a permanent feature of the product. Somebody on their fourth real prompt
 * does not need a four-step checklist about what a run is, and showing one to them would be the
 * product talking down to a user it already has.
 *
 * ## Why every step is derived
 *
 * EPIC-034 decision 4: each step is a question about rows that already exist. Nothing is stored, so
 * the indicator is correct for a person who closed the tab and came back tomorrow, and it can never
 * disagree with what actually happened — when a stored position and the rows disagree, it is always
 * the stored position that is wrong.
 *
 * A step is **not** ticked just because a later one is: somebody whose first run happens to pass
 * never saw a failure, and the list says so rather than inventing a step they skipped.
 */
export function ActivationProgress({ steps }: { steps: readonly ActivationStep[] }) {
  const done = activationDone(steps);

  return (
    <section className="app-progress" aria-label="Getting started">
      <h2>
        Getting started <span className="app-progress-count">{done} of {steps.length}</span>
      </h2>
      <ol>
        {steps.map((step) => (
          <li key={step.key} data-done={step.done ? "true" : "false"}>
            {/* The word, not only the tick: no state in this product is carried by a glyph or a
                colour alone (`CLAUDE.md` rule 10, and the same reasoning for an icon). */}
            <span className="app-progress-mark" aria-hidden="true">
              {step.done ? "✓" : "○"}
            </span>
            <span>{step.title}</span>
            <span className="app-progress-state">{step.done ? "done" : "to do"}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
