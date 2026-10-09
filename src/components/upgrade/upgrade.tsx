"use client";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Dialog } from "@/components/dialog";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { track } from "@/lib/analytics";
import { cx } from "@/lib/cx";
import { PERFORMANCE_PERKS, type PerformanceFeature, type Plan } from "@/lib/plans";
import s from "./upgrade-sheet.module.css";

/* Every Performance control stays visible on Free, marked with the stamp,
   and opens this sheet instead of running (docs/DESIGN.md §7). The server
   enforces the plan; this is only the hint. With pricing off the sheet shows
   no price and offers "Tell me when it opens" instead of Checkout. */

type UpgradeConfig = {
  plan: Plan;
  pricingEnabled: boolean;
  /** Formatted price, e.g. "$12", when pricing is on. */
  priceLabel?: string;
  /** Records interest for the signed-in user; resolves true once stored. */
  registerInterest?: (feature: string) => Promise<boolean>;
  /** Starts Stripe Checkout; resolves to a URL to open. */
  startCheckout?: () => Promise<string | null>;
  /** Whether this user already asked to hear about Performance. */
  interested?: boolean;
};

type Ctx = { open: (feature: PerformanceFeature) => void; plan: Plan };
const UpgradeContext = createContext<Ctx>({ open: () => {}, plan: "free" });

export function useUpgrade() {
  return useContext(UpgradeContext);
}

export function UpgradeProvider({ children, ...config }: UpgradeConfig & { children: React.ReactNode }) {
  const toast = useToast();
  const [feature, setFeature] = useState<string | null>(null);
  const [noted, setNoted] = useState(Boolean(config.interested));
  const [busy, setBusy] = useState(false);

  const open = useCallback(
    (f: PerformanceFeature) => {
      track("performance_control_clicked", { feature: f, plan: config.plan });
      if (config.plan === "performance") {
        toast(`${f} is on its way. It is part of your plan as soon as it ships.`);
        return;
      }
      setFeature(f);
    },
    [config.plan, toast],
  );
  const value = useMemo(() => ({ open, plan: config.plan }), [open, config.plan]);
  const close = () => {
    setFeature(null);
    setBusy(false);
  };

  async function interest() {
    if (!config.registerInterest || !feature) return;
    setBusy(true);
    const ok = await config.registerInterest(feature).catch(() => false);
    setBusy(false);
    if (ok) {
      setNoted(true);
      track("performance_interest", { feature });
      toast("Noted. We will email you when Performance opens.");
    } else {
      toast("That did not save. Try again in a moment.", { tone: "bad" });
    }
  }

  async function checkout() {
    if (!config.startCheckout) return;
    setBusy(true);
    const url = await config.startCheckout().catch(() => null);
    if (url) window.location.assign(url);
    else {
      setBusy(false);
      toast("Stripe Checkout did not open. Try again in a moment.", { tone: "bad" });
    }
  }

  return (
    <UpgradeContext.Provider value={value}>
      {children}
      <Dialog open={feature !== null} onClose={close} labelledBy="upgradeTitle">
        <div className="dlg__panel frame">
          <button type="button" className="btn btn--icon btn--sm btn--bare dlg__close" onClick={close} aria-label="Close">
            <Icon name="x" />
          </button>
          <span className={cx("stamp", s.stamp)}>Performance</span>
          <h2 className={s.title} id="upgradeTitle">
            <span>{feature ?? "This tool"}</span> is part of Performance.
          </h2>
          <p className={s.p}>Free stays unlimited for writing, saving and copying prompts. Performance adds the tools that test, measure and share them.</p>
          <ul className={s.list}>
            {PERFORMANCE_PERKS.map(([id, text], i) => (
              <li key={id} style={{ "--k": i } as React.CSSProperties}>
                <span>{id}</span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
          {config.pricingEnabled ? (
            <>
              <p className={s.price}>
                <b>{config.priceLabel ?? ""}</b> / month · billed through Stripe · cancel anytime
              </p>
              <div className={s.actions}>
                <button type="button" className="btn" onClick={close}>
                  Not now
                </button>
                <button type="button" className={cx("btn btn--primary", busy && "is-busy")} onClick={checkout} disabled={busy}>
                  <span className="btn-spin" aria-hidden="true" />
                  <span>{busy ? "Opening Stripe Checkout" : "Upgrade with Stripe"}</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <p className={s.price}>Performance is not on sale yet.</p>
              <div className={s.actions}>
                <button type="button" className="btn" onClick={close}>
                  Not now
                </button>
                {noted ? (
                  <span className={s.noted} role="status">
                    <Icon name="check" size="sm" />
                    Noted. We will email you when it opens.
                  </span>
                ) : (
                  <button type="button" className={cx("btn btn--primary", busy && "is-busy")} onClick={interest} disabled={busy || !config.registerInterest}>
                    <span className="btn-spin" aria-hidden="true" />
                    <span>Tell me when it opens</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </Dialog>
    </UpgradeContext.Provider>
  );
}

type PerfButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & { feature: PerformanceFeature };

/** A Performance control as seen on Free: dashed, stamped, opens the sheet. */
export function PerfButton({ feature, className, children, ...rest }: PerfButtonProps) {
  const { open } = useUpgrade();
  return (
    <button type="button" data-perf={feature} className={cx("btn btn--locked", className)} onClick={() => open(feature)} {...rest}>
      {children}
    </button>
  );
}
