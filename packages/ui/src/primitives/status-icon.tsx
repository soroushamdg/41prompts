export type Status = "pass" | "fail" | "drift";

const GLYPH: Record<Status, string> = {
  pass: "✓",
  fail: "✕",
  drift: "!",
};

/**
 * The glyph half of "icon and text, never colour alone" (decision 3 / CLAUDE.md rule 10). Always
 * pair with visible text — this renders `aria-hidden` since the text next to it is the real
 * accessible name.
 */
export function StatusIcon({ status }: { status: Status }) {
  return (
    <span aria-hidden="true" className="status-icon">
      {GLYPH[status]}
    </span>
  );
}
