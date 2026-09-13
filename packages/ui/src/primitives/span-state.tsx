import type { ReactNode } from "react";
import { cx } from "../cx";

/**
 * The four things the compiled pane can say about a span.
 *
 * A component rather than inline styles (EPIC-021b scope), so the rule that **no state is carried by
 * colour alone** is enforced in one place: every visible state renders a word, and the colour is at
 * most a reinforcement of it.
 *
 * `in-step` renders nothing. It is the ordinary case and also the home of a fifth model cell — a
 * blok whose kind changed and whose text did not — which is deliberately silent because there is
 * nothing the reader can act on.
 */
export type SpanPresentationName = "in-step" | "edited" | "edited-changed" | "out-of-date";

export interface SpanStateBadgeProps {
  presentation: SpanPresentationName;
  /** The word(s). Never omitted for a visible state — that would leave colour as the only signal. */
  children?: ReactNode;
}

/**
 * **Amber is drift and only drift** (`CLAUDE.md` rule 10, EPIC-021b decision 4).
 *
 * Drift is "the blok has changed since this span was compiled or edited", so it is exactly the two
 * presentations where that is true. A hand edit whose blok has not moved is a choice somebody made,
 * not drift, and carries ink — which is why this is a function and not a lookup table somebody can
 * extend without noticing what they are claiming.
 */
export function isDriftPresentation(presentation: SpanPresentationName): boolean {
  return presentation === "edited-changed" || presentation === "out-of-date";
}

export function SpanStateBadge({ presentation, children }: SpanStateBadgeProps) {
  if (presentation === "in-step" || children === undefined) return null;
  return (
    <span
      className={cx("span-state-badge", isDriftPresentation(presentation) && "span-state-badge-drift")}
      data-presentation={presentation}
    >
      {children}
    </span>
  );
}

export interface SpanStateNoteProps {
  presentation: SpanPresentationName;
  /** The ruled sentence. See EPIC-021b's report §1. */
  children?: ReactNode;
  /** "Update from blok", supplied by the pane because only it can perform one. */
  action?: ReactNode;
}

/** The sentence and its action, shown for a span the reader can do something about. */
export function SpanStateNote({ presentation, children, action }: SpanStateNoteProps) {
  if (presentation === "in-step" || children === undefined) return null;
  return (
    <div
      className={cx("span-state-note", isDriftPresentation(presentation) && "span-state-note-drift")}
      data-presentation={presentation}
      role="note"
    >
      <p className="span-state-note-text">{children}</p>
      {action}
    </div>
  );
}
