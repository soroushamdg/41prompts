import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GalleryClient } from "./gallery-client";

export const metadata: Metadata = {
  title: "Design system gallery",
  robots: { index: false, follow: false },
};

/** Component gallery for EPIC-003. Reachable on staging and in development only (never linked
 * from user-facing navigation either way) — see docs/epics/EPIC-003-design-system.md's scope. */
export default function DevUiPage() {
  if (process.env.DEPLOY_ENV === "production") {
    notFound();
  }

  return <GalleryClient />;
}
