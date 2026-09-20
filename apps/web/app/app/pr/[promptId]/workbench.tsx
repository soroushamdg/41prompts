"use client";

import { Tabs } from "@41prompts/ui";
import { useState, type ReactNode } from "react";

/**
 * The tab strip the mockup shows above the editor: `Editor · Variables · Assertions · Providers`.
 *
 * **All four ship as of EPIC-024.** Two of them did not, and the note this comment used to carry
 * said why: *"Assertions is Stage 3 and Providers is Stage 4, and a disabled tab that does nothing
 * is a worse promise than an absent one."* Both stages finished; the reason expired and nothing
 * noticed until the mockup was read against the built app.
 *
 * The note also briefed whoever built the third tab to call it **Checks**, because ADR-003 forbids
 * "assertion" in UI strings and `docs/design/README.md` says so in as many words. Met — the label
 * is `Checks` and `pnpm forbidden-words` would fail on the alternative.
 *
 * The strip is a client component so the selected tab survives interaction without a navigation;
 * both panels are rendered on the server and passed in as children, so switching tabs costs nothing
 * and neither panel has to re-fetch.
 */
export function Workbench({
  editor,
  variables,
  checks,
  providers
}: {
  editor: ReactNode;
  variables: ReactNode;
  checks: ReactNode;
  providers: ReactNode;
}) {
  const [tab, setTab] = useState("editor");

  return (
    <Tabs
      name="Prompt workbench"
      className="workbench"
      value={tab}
      onValueChange={setTab}
      items={[
        { value: "editor", text: "Editor", panel: editor },
        { value: "variables", text: "Variables", panel: variables },
        { value: "checks", text: "Checks", panel: checks },
        { value: "providers", text: "Providers", panel: providers }
      ]}
    />
  );
}
