import { eq } from "drizzle-orm";
import page from "@/components/shell/page.module.css";
import { Topbar } from "@/components/shell/topbar";
import { db } from "@/db";
import { user } from "@/db/schema";
import { PRICING_ENABLED } from "@/lib/env";
import { initialFor } from "@/lib/user";
import { signInMethods } from "@/server/account";
import { priceLabel, syncCheckoutSession } from "@/server/billing";
import { listKeys } from "@/server/keys";
import { versionCounts } from "@/server/prompts";
import { requireViewer } from "@/server/session";
import { BillingSection } from "./billing-section";
import { DataSection } from "./data-section";
import { KeysSection } from "./keys-section";
import { SettingsNav } from "./settings-nav";
import { SignOutButton } from "./sign-out-button";
import s from "./settings.module.css";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ checkout?: string; session_id?: string }> }) {
  const viewer = await requireViewer("/settings");
  const q = await searchParams;
  if (PRICING_ENABLED && q.checkout === "success" && q.session_id) {
    // Webhooks can lag behind the redirect from Checkout; sync right away.
    await syncCheckoutSession(db, viewer.id, q.session_id).catch(() => null);
  }
  const [keys, methods, counts, [billing], price] = await Promise.all([
    listKeys(db, viewer.id),
    signInMethods(db, viewer.id),
    versionCounts(db, viewer.id),
    db.select({ plan: user.plan, status: user.subscriptionStatus, periodEnd: user.currentPeriodEnd, customer: user.stripeCustomerId }).from(user).where(eq(user.id, viewer.id)),
    PRICING_ENABLED ? priceLabel() : Promise.resolve(null),
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
            <section className={s.sec} id="keys" aria-labelledby="keysT">
              <h2 id="keysT">Model keys</h2>
              <p>Your keys run your prompts. Each provider bills your own account. Free runs on one model at a time; Performance runs all three side by side.</p>
              <KeysSection initial={keys} />
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
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
