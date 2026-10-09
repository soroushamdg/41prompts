import { ReviewProvider } from "@/components/review/review";
import { UpgradeProvider } from "@/components/upgrade/upgrade";
import { db } from "@/db";
import { PRICING_ENABLED } from "@/lib/env";
import { registerInterestAction } from "@/server/actions/interest";
import { priceLabel } from "@/server/billing";
import { hasInterest } from "@/server/interest";
import { getReviewState } from "@/server/review";
import { requireViewer } from "@/server/session";

/** Everything after sign-in. The session is checked here and again in every
    route handler and server action. */
export default async function SignedInLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  const interested = viewer.plan === "free" && !PRICING_ENABLED ? await hasInterest(db, viewer.id) : false;
  const price = PRICING_ENABLED && viewer.plan === "free" ? await priceLabel() : null;
  const review = await getReviewState(db, viewer.id, viewer.createdAt);
  return (
    <UpgradeProvider plan={viewer.plan} pricingEnabled={PRICING_ENABLED} priceLabel={price ?? undefined} registerInterest={registerInterestAction} interested={interested}>
      <ReviewProvider initial={review}>{children}</ReviewProvider>
    </UpgradeProvider>
  );
}
