"use client";
import { useEffect, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { Icon } from "@/components/icon";
import { cx } from "@/lib/cx";
import { APP_HINT_COOKIE, appUrl } from "@/lib/hosts";
import s from "../landing.module.css";

/* Signed-in visitors see "Go to app" instead of Sign in and Start free. The
   app sets a hint cookie on the shared parent domain (see proxy.ts); the page
   is static, so it renders the signed-out buttons first and then folds them
   into one, as a view transition where the browser has them. The hint proves
   nothing: the app checks the real session when the link is followed. */

let inApp = false;
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};
const flip = () => {
  inApp = true;
  listeners.forEach((l) => l());
};

function useInApp() {
  return useSyncExternalStore(
    subscribe,
    () => inApp,
    () => false,
  );
}

const HINT = new RegExp(`(?:^|;\\s*)${APP_HINT_COOKIE}=1(?:;|$)`);
const MORPH_DELAY_MS = 450;

/** Mounted once per page, in the header: reads the hint and runs the morph. */
function AppHint() {
  useEffect(() => {
    if (inApp || !HINT.test(document.cookie)) return;
    const t = window.setTimeout(() => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reduce && typeof document.startViewTransition === "function") {
        // Marks the buttons as morphed, so they skip their fallback entrance.
        document.documentElement.dataset.ctaMorph = "vt";
        document.startViewTransition(() => flushSync(flip));
      } else flip();
    }, MORPH_DELAY_MS);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}

const vt = (name: string) => ({ viewTransitionName: name }) as React.CSSProperties;

/** The button signed-in visitors get, wherever Start free would be. */
function GoToApp({ name, className }: { name: string; className: string }) {
  return (
    <a className={cx(className, s.go)} href={appUrl("/")} style={vt(name)}>
      <span className={s.goDot} aria-hidden="true" />
      Go to app
      <span className={s.goArrow} aria-hidden="true">
        <Icon name="arrow-right" />
        <Icon name="arrow-right" />
      </span>
    </a>
  );
}

/** Header: Sign in and Start free, or Go to app. */
export function HeaderCta() {
  const signedIn = useInApp();
  return (
    <>
      <AppHint />
      {!signedIn && (
        <a className="btn btn--sm btn--bare" href={appUrl("/sign-in")} style={vt("cta-signin")}>
          Sign in
        </a>
      )}
      {signedIn ? (
        <GoToApp name="cta-head" className="btn btn--sm btn--primary" />
      ) : (
        <a className="btn btn--sm btn--primary" href={appUrl("/sign-in#start")} style={vt("cta-head")}>
          Start free
        </a>
      )}
    </>
  );
}

/** A Start free button elsewhere on the page. `name` must be unique per page. */
export function StartCta({ name, className, arrow = true, label = "Start free", href = appUrl("/sign-in#start") }: { name: string; className: string; arrow?: boolean; label?: string; href?: string }) {
  const signedIn = useInApp();
  if (signedIn) return <GoToApp name={name} className={className} />;
  return (
    <a className={className} href={href} style={vt(name)}>
      {label}
      {arrow && <Icon name="arrow-right" />}
    </a>
  );
}

/** Start Performance: signed-in visitors go straight to checkout in Settings. */
export function PerformanceCta({ className }: { className: string }) {
  const signedIn = useInApp();
  return (
    <a className={className} href={signedIn ? appUrl("/settings?checkout=1#billing") : appUrl("/sign-in#performance")}>
      Start Performance <Icon name="arrow-right" />
    </a>
  );
}

/** The footer's Sign in link. */
export function FootAppLink() {
  const signedIn = useInApp();
  return (
    <a href={signedIn ? appUrl("/") : appUrl("/sign-in")} style={vt("cta-foot")}>
      {signedIn ? "Go to app" : "Sign in"}
    </a>
  );
}
