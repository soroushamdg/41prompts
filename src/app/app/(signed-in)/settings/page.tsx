import { eq } from "drizzle-orm";
import page from "@/components/shell/page.module.css";
import { Topbar } from "@/components/shell/topbar";
import { db } from "@/db";
import { user } from "@/db/schema";
import { PRICING_ENABLED } from "@/lib/env";
import { initialFor } from "@/lib/user";
import { signInMethods } from "@/server/account";
import { priceLabel, syncCheckoutSession } from "@/server/billing";
import { hasInterest } from "@/server/interest";
import { listConnections } from "@/server/connections";
import { versionCounts } from "@/server/prompts";
import { requireViewer } from "@/server/session";
import { BillingSection } from "./billing-section";
import { DataSection } from "./data-section";
import { ModelsSection } from "./models-section";
import { SettingsNav } from "./settings-nav";
import { ProductHuntBadge } from "@/components/review/review";
import { SignOutButton } from "./sign-out-button";
import s from "./settings.module.css";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ checkout?: string; session_id?: string; add?: string }> }) {
  const viewer = await requireViewer("/settings");
  const q = await searchParams;
  if (PRICING_ENABLED && q.checkout === "success" && q.session_id) {
    // Webhooks can lag behind the redirect from Checkout; sync right away.
    await syncCheckoutSession(db, viewer.id, q.session_id).catch(() => null);
  }
  const [models, methods, counts, [billing], price, interested] = await Promise.all([
    listConnections(db, viewer.id),
    signInMethods(db, viewer.id),
    versionCounts(db, viewer.id),
    db.select({ plan: user.plan, status: user.subscriptionStatus, periodEnd: user.currentPeriodEnd, customer: user.stripeCustomerId }).from(user).where(eq(user.id, viewer.id)),
    PRICING_ENABLED ? priceLabel() : Promise.resolve(null),
    hasInterest(db, viewer.id),
  ]);
  return (
    <>
      <Topbar />
      <main className={`${page.page} app-bg`} id="main">
        <div className={page.head}>
          <div>
            <span className="sheetno">Sheet A05 · Settings</span>
            <h1>Settings</h1>
          </div>
        </div>
        <div className={s.set}>
          <SettingsNav />
          <div className={s.main}>
            <section className={s.sec} id="models" aria-labelledby="modelsT">
              {/* Old links to #keys land here too. */}
              <span id="keys" aria-hidden="true" />
              <h2 id="modelsT">Models</h2>
              <ModelsSection initial={models} userId={viewer.id} openAdd={q.add === "1"} />
            </section>

            <section className={s.sec} id="billing" aria-labelledby="billT">
              <h2 id="billT">Plan and billing</h2>
              <p>Free is unlimited for writing, saving, versioning and copying prompts. Performance adds the tools that test, measure and share them.</p>
              <BillingSection
                plan={billing?.plan ?? viewer.plan}
                pricingEnabled={PRICING_ENABLED}
                price={price}
                status={billing?.status ?? null}
                periodEnd={billing?.periodEnd?.toISOString() ?? null}
                hasCustomer={Boolean(billing?.customer)}
                autoCheckout={q.checkout === "1"}
                justPaid={q.checkout === "success"}
                interested={interested}
              />
            </section>

            <section className={s.sec} id="data" aria-labelledby="dataT">
              <h2 id="dataT">Data and privacy</h2>
              <DataSection prompts={counts.prompts} versions={counts.versions} />
            </section>

            <section className={s.sec} id="account" aria-labelledby="accT">
              <h2 id="accT">Account</h2>
              <div className={s.box}>
                <div className={s.row}>
                  <span className="avatar" aria-hidden="true" style={{ width: 44, height: 44 }}>{initialFor(viewer.name, viewer.email)}</span>
                  <div className={s.rowMain}>
                    <b>{viewer.name || viewer.email.split("@")[0]}</b>
                    <span className="mono">{viewer.email} · signs in with {methods.join(", ")}</span>
                  </div>
                  <SignOutButton />
                </div>
                <div className={s.row}>
                  <div className={s.rowMain}>
                    <b>Review 41prompts</b>
                    <span>If it has saved you some guessing, a short review on Product Hunt helps other people who write prompts find it.</span>
                  </div>
                  <ProductHuntBadge />
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
