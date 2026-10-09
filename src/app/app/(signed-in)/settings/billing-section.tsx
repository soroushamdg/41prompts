"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { startCheckout } from "@/components/upgrade/upgrade";
import { useToast } from "@/components/toast";
import { track } from "@/lib/analytics";
import { cx } from "@/lib/cx";
import type { Plan } from "@/lib/plans";
import { shortDate } from "@/lib/time";
import { registerInterestAction } from "@/server/actions/interest";
import s from "./settings.module.css";

type Props = {
  plan: Plan;
  pricingEnabled: boolean;
  price: string | null;
  status: string | null;
  periodEnd: string | null;
  hasCustomer: boolean;
  autoCheckout: boolean;
  justPaid: boolean;
  interested: boolean;
};

const FREE = ["Unlimited prompts, bloks and versions", "Bloks editor with the compiled prompt", "One-click copy, template or filled", "Run on one model with your key", "Library with search by name", "Export everything, delete anytime"];
const PERF: Array<[string, string]> = [
  ["Everything in Free", ""],
  ["Failure attribution to the exact blok", "P01"],
  ["Linter and decompiler", "P02 · P03"],
  ["Tests from expects bloks", "P04"],
  ["Side-by-side runs with cost and latency", "P05"],
  ["Search inside prompts, tags, filters", "P06"],
  ["Semantic diffs, shared workspaces", "P07 · P08"],
  ["Share pages, typed export, presence", "D01–D03"],
];

/** Plan and billing (B01). With pricing off it shows no price and no Checkout. */
export function BillingSection(p: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState<"checkout" | "portal" | "interest" | null>(null);
  const [noted, setNoted] = useState(p.interested);
  const card = useRef<HTMLElement>(null);
  const started = useRef(false);
  const perf = p.plan === "performance";

  async function checkout() {
    setBusy("checkout");
    const url = await startCheckout().catch(() => null);
    if (url) return window.location.assign(url);
    setBusy(null);
    toast("Stripe Checkout did not open. Try again in a moment.", { tone: "bad" });
  }
  async function interest() {
    setBusy("interest");
    const ok = await registerInterestAction("Performance plan").catch(() => false);
    setBusy(null);
    if (!ok) return toast("That did not save. Try again in a moment.", { tone: "bad" });
    setNoted(true);
    track("performance_interest", { feature: "Performance plan" });
    toast("Noted. We will email you when Performance opens.");
  }
  async function portal() {
    setBusy("portal");
    const res = await fetch("/api/stripe/portal", { method: "POST" }).catch(() => null);
    const url = res?.ok ? ((await res.json()) as { url?: string }).url : null;
    if (url) return window.location.assign(url);
    setBusy(null);
    toast("The billing portal did not open. Try again in a moment.", { tone: "bad" });
  }

  useEffect(() => {
    if (p.justPaid) toast(perf ? "Welcome to Performance." : "Payment received. Your plan updates as soon as Stripe confirms it.");
    if (p.autoCheckout && p.pricingEnabled && !perf && !started.current) {
      started.current = true;
      queueMicrotask(() => void checkout());
    }
    if (window.location.hash === "#billing" && card.current && !document.documentElement.classList.contains("reduce")) {
      const el = card.current;
      setTimeout(() => el.classList.add(s.highlight!), 500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className={s.planrow}>
        <article className={cx("frame", s.plancard)}>
          <div className={s.planTop}>
            <span className="label">Free</span>
            {!perf && <span className="chip chip--ok"><span className="dot" />Current plan</span>}
          </div>
          {p.pricingEnabled && <div className={s.price}><b>$0</b><span>forever</span></div>}
          <ul>{FREE.map((f) => <li key={f}>{f}</li>)}</ul>
        </article>
        <article ref={card} className={cx("frame frame--live", s.plancard, s.plancardPerf)}>
          <div className={s.planTop}>
            <span className="label" style={{ color: "var(--chalk)" }}>Performance</span>
            {perf ? <span className="chip chip--ok"><span className="dot" />Current plan</span> : <span className="stamp">Performance</span>}
          </div>
          {p.pricingEnabled && p.price ? (
            <div className={s.price}><b>{p.price}</b><span>/ month</span></div>
          ) : !p.pricingEnabled ? (
            <div className={s.price}><b className={s.tbd}>Not on sale yet</b></div>
          ) : null}
          <ul>
            {PERF.map(([f, id]) => (
              <li key={f}>{f} {id && <small>{id}</small>}</li>
            ))}
          </ul>
          {perf ? (
            <p className={s.status}>
              {p.status === "past_due" ? "Your last payment did not go through. Stripe retries it; update your card in the billing portal to keep Performance." : p.periodEnd ? <span suppressHydrationWarning>Renews on {shortDate(new Date(p.periodEnd), new Date())}.</span> : "Active."}
            </p>
          ) : p.pricingEnabled ? (
            <button className={cx("btn btn--primary btn--block btn--go", busy === "checkout" && "is-busy")} type="button" onClick={checkout} disabled={busy !== null}>
              <span className="btn-spin" aria-hidden="true" />
              <span>{busy === "checkout" ? "Opening Stripe Checkout" : "Upgrade with Stripe"}</span>
              <Icon name="arrow-right" />
            </button>
          ) : noted ? (
            <p className={s.status} role="status"><Icon name="check" size="sm" /> Noted. We will email you when it opens.</p>
          ) : (
            <button className={cx("btn btn--block", busy === "interest" && "is-busy")} type="button" onClick={interest} disabled={busy !== null}>
              <span className="btn-spin" aria-hidden="true" />
              Tell me when it opens
            </button>
          )}
        </article>
      </div>
      {p.pricingEnabled && (
        <div className={s.box}>
          <div className={s.row}>
            <div className={s.rowMain}>
              <b>Billing portal</b>
              <span>Change your card, download invoices or cancel. Run by Stripe.{p.hasCustomer ? "" : " Available once you subscribe."} Cancelling keeps everything on Free.</span>
            </div>
            <button className={cx("btn btn--sm", busy === "portal" && "is-busy")} type="button" disabled={!p.hasCustomer || busy !== null} onClick={portal}>
              <Icon name="external" />Manage billing in Stripe
            </button>
          </div>
        </div>
      )}
    </>
  );
}
