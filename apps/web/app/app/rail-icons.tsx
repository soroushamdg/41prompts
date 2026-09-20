import type { ReactElement } from "react";
import type { RailItemId } from "@/lib/app-shell/context";

/**
 * The rail's icons, copied verbatim from `docs/design/41prompts-full-mockup.html` lines 1046–1060.
 *
 * `docs/design/README.md`: *"Copy the SVGs verbatim."* The path data here is the mockup's, character
 * for character; only the surrounding attributes are ours, and they match the mockup's `.rail svg`
 * rule — `stroke: currentColor`, `fill: none`, `stroke-width: 1.9`, `stroke-linecap: square`, which
 * live in `app-shell.css` rather than being repeated on every element.
 *
 * **`aria-hidden`, always.** Each icon sits beside its own label in the rail, so an accessible name
 * here would make every item announce twice. The label is the name.
 *
 * There is no icon for Lessons. The mockup has one — a mortarboard, line 1057 — and Lessons is not
 * in the rail until Stage 7 builds it, so the icon would be an export nothing names and
 * `pnpm dead-code` would fail the build on it. It is in the mockup when it is wanted.
 */
const PATHS: Record<RailItemId, ReactElement> = {
  projects: (
    <>
      <rect x="3" y="3" width="8" height="8" />
      <rect x="13" y="3" width="8" height="8" />
      <rect x="3" y="13" width="8" height="8" />
      <rect x="13" y="13" width="8" height="8" />
    </>
  ),
  import: <path d="M12 3v12M7 10l5 5 5-5M4 20h16" />,
  editor: (
    <>
      <rect x="3" y="4" width="8" height="16" />
      <rect x="13" y="4" width="8" height="7" />
      <rect x="13" y="13" width="8" height="7" />
    </>
  ),
  // The project page lists prompts, so it carries the mockup's Blok Editor glyph (line 1053) at a
  // different scale of the same idea: panes of a prompt, stacked.
  prompts: (
    <>
      <rect x="3" y="4" width="18" height="6" />
      <rect x="3" y="14" width="18" height="6" />
    </>
  ),
  runs: <path d="M4 12l5 5L20 6" />,
  versions: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  deploy: <path d="M12 20V6M6 12l6-6 6 6M4 21h16" />,
  connect: <path d="M9 7H6a5 5 0 0 0 0 10h3M15 7h3a5 5 0 0 1 0 10h-3M9 12h6" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
    </>
  ),
  // The mockup has no Account item — it draws identity in the rail foot only. This is the cog's
  // sibling in the same family: a person, drawn with the same two primitives the others use.
  account: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a8 8 0 0 1 16 0v1" />
    </>
  )
};

export function RailIcon({ id }: { id: RailItemId }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {PATHS[id]}
    </svg>
  );
}
