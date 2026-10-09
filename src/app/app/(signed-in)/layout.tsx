import { UpgradeProvider } from "@/components/upgrade/upgrade";
import { db } from "@/db";
import { PRICING_ENABLED } from "@/lib/env";
import { registerInterestAction } from "@/server/actions/interest";
import { hasInterest } from "@/server/interest";
import { requireViewer } from "@/server/session";

/** Everything after sign-in. The session is checked here and again in every
    route handler and server action. */
export default async function SignedInLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  const interested = viewer.plan === "free" && !PRICING_ENABLED ? await hasInterest(db, viewer.id) : false;
  return (
    <UpgradeProvider plan={viewer.plan} pricingEnabled={PRICING_ENABLED} registerInterest={registerInterestAction} interested={interested}>
      {children}
    </UpgradeProvider>
  );
}
