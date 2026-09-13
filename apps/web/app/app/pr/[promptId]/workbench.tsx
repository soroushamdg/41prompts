"use client";

import { Tabs } from "@41prompts/ui";
import { useState, type ReactNode } from "react";

/**
 * The tab strip the mockup shows above the editor: `Editor · Variables · Assertions · Providers`.
 *
 * **Two tabs ship, not four.** Assertions is Stage 3 and Providers is Stage 4, and a disabled tab
 * that does nothing is a worse promise than an absent one — it tells a reader the feature is here
 * and broken rather than not here yet.
 *
 * *For whoever builds the third:* the mockup labels it "Assertions", which ADR-003 forbids in UI
 * strings. `docs/design/README.md`'s corrections section already says to build "checks". Meet that
 * before writing the label rather than after.
 *
 * The strip is a client component so the selected tab survives interaction without a navigation;
 * both panels are rendered on the server and passed in as children, so switching tabs costs nothing
 * and neither panel has to re-fetch.
 */
export function Workbench({ editor, variables }: { editor: ReactNode; variables: ReactNode }) {
  const [tab, setTab] = useState("editor");

  return (
    <Tabs
      name="Prompt workbench"
      className="workbench"
      value={tab}
      onValueChange={setTab}
      items={[
        { value: "editor", text: "Editor", panel: editor },
        { value: "variables", text: "Variables", panel: variables }
      ]}
    />
  );
}
