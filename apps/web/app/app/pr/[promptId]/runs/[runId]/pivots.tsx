"use client";

import { Tabs } from "@41prompts/ui";
import { useState, type ReactNode } from "react";

/**
 * "By check" and "By input", as real ARIA tabs.
 *
 * `docs/design/README.md` again: the prototypes use styled buttons where tabs belong, and the build
 * owes the real pattern — one tab stop for the tablist, arrows inside it, `aria-controls` and
 * `aria-selected` on every tab. `packages/ui`'s `Tabs` is that pattern and this is a third use of
 * it rather than a fourth implementation.
 *
 * **Both panels are rendered by the server and only one is shown.** The alternative — fetching the
 * other pivot when somebody presses the tab — would make the second view a request away on a page
 * whose whole argument is that the run is already finished and the answer already exists.
 */
export function Pivots({ byCheck, byInput }: { byCheck: ReactNode; byInput: ReactNode }) {
  const [value, setValue] = useState("check");

  return (
    <Tabs
      className="runs-pivots"
      name="How to read this run"
      value={value}
      onValueChange={setValue}
      items={[
        { value: "check", text: "By check", panel: byCheck },
        { value: "input", text: "By input", panel: byInput },
      ]}
    />
  );
}
