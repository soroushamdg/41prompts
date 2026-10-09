"use client";
import { useRef, useState, useSyncExternalStore } from "react";
import { authClient } from "@/lib/auth-client";
import { cx } from "@/lib/cx";
import { siteUrl } from "@/lib/hosts";
import s from "./sign-in.module.css";

/* One form for sign-in and sign-up: an email link, or Google / GitHub.
   #start and #performance (from the landing page) change the heading; with
   pricing on, #performance continues to Stripe Checkout after sign-in. */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const ERRORS = {
  link: "That sign-in link has expired or was already used. Ask for a new one below.",
  oauth: "That sign-in did not finish. Try again, or use an email link.",
};

type Props = { next: string; error?: { via: "link" | "oauth" }; providers: Array<"google" | "github">; pricingEnabled: boolean };

function subscribeHash(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

export function SignInForm({ next, error, providers, pricingEnabled }: Props) {
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash.replace("#", ""), () => "");
  const mode: "in" | "start" | "performance" = hash === "performance" && pricingEnabled ? "performance" : hash === "start" || hash === "performance" ? "start" : "in";
  const [email, setEmail] = useState("");
  const [bad, setBad] = useState(false);
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(error ? ERRORS[error.via] : null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [drawn, setDrawn] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const callbackURL = mode === "performance" ? "/settings?checkout=1" : next;
  const newUserCallbackURL = callbackURL + (callbackURL.includes("?") ? "&" : "?") + "welcome=1";

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    const v = email.trim();
    if (!EMAIL.test(v)) {
      setBad(true);
      setShake((n) => n + 1);
      input.current?.focus();
      return;
    }
    setBad(false);
    setFailure(null);
    setBusy(true);
    const { error: err } = await authClient.signIn.magicLink({ email: v, callbackURL, newUserCallbackURL, errorCallbackURL: "/sign-in?via=link" });
    setBusy(false);
    if (err) {
      setFailure(err.status === 429 ? "Too many links in a short time. Wait a minute and try again." : "The link did not send. Check the address and try again.");
      return;
    }
    setSentTo(v);
    requestAnimationFrame(() => requestAnimationFrame(() => setDrawn(true)));
  }

  function social(provider: "google" | "github") {
    setFailure(null);
    void authClient.signIn.social({ provider, callbackURL, newUserCallbackURL, errorCallbackURL: "/sign-in?via=oauth" });
  }

  return (
    <div className={s.card}>
      <span className="sheetno">Sheet A01 · Access</span>
      <h1>{mode === "in" ? "Sign in to 41prompts" : "Create your account"}</h1>
      <p>One link by email. No password, no card.</p>

      {mode === "performance" && (
        <p className="notice">
          <svg className="i" aria-hidden="true"><use href="#i-card" /></svg>
          <span>After you sign in, Stripe Checkout opens to start <b>Performance</b>.</span>
        </p>
      )}

      {sentTo ? (
        <div className={cx("frame", s.sent)} role="status" data-drawn={drawn ? "" : undefined}>
          <svg viewBox="0 0 64 44" aria-hidden="true"><rect x="2" y="2" width="60" height="40" rx="3" pathLength={1} /><path d="M3 5 L32 26 L61 5" pathLength={1} /></svg>
          <b>Check your inbox</b>
          <p>We sent a sign-in link to <span>{sentTo}</span>. It works once and expires in 15 minutes.</p>
          <div className={s.actions}>
            <button className="btn btn--sm" type="button" onClick={() => { setSentTo(null); setDrawn(false); requestAnimationFrame(() => input.current?.focus()); }}>
              Use a different email
            </button>
          </div>
        </div>
      ) : (
        <form className={cx("frame frame--quiet", s.panel)} onSubmit={sendLink} noValidate>
          <div className="field">
            <label className="label" htmlFor="email">Email</label>
            <input
              ref={input}
              key={shake}
              className={cx("input", bad && "is-bad", shake > 0 && bad && s.shake)}
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              required
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (bad) setBad(false); }}
              aria-invalid={bad || undefined}
              aria-describedby={bad ? "emailErr" : undefined}
            />
          </div>
          {bad && <p className={s.err} id="emailErr" role="alert">Enter an email address like you@company.com.</p>}
          {failure && <p className={s.err} role="alert">{failure}</p>}
          <button className={cx("btn btn--primary btn--lg btn--block", busy && "is-busy")} type="submit" disabled={busy}>
            <span className="btn-spin" aria-hidden="true" />
            <span>{busy ? "Sending link" : "Email me a sign-in link"}</span>
          </button>
          {providers.length > 0 && <div className={s.or}>OR</div>}
          {providers.includes("google") && <button className="btn btn--block" type="button" onClick={() => social("google")}>Continue with Google</button>}
          {providers.includes("github") && <button className="btn btn--block" type="button" onClick={() => social("github")}>Continue with GitHub</button>}
        </form>
      )}

      <p className={s.fine}>
        New here? The same link creates your account. Your prompts are private by default. By continuing you agree to the <a href={siteUrl("/terms")}>Terms</a> and <a href={siteUrl("/privacy")}>Privacy policy</a>.
      </p>
    </div>
  );
}
