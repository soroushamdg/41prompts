import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { safeNext } from "@/lib/auth";
import { siteUrl } from "@/lib/hosts";
import { MarkSheet } from "../mark-sheet";
import s from "../sign-in.module.css";
import { ContinueButton } from "./continue-button";

export const metadata = { title: "Sign in" };

/* The emailed link lands here instead of on the verify endpoint, so mail
   scanners that open links do not use up the single-use token. */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  if (!q.token) redirect("/sign-in");
  const verify = new URLSearchParams({
    token: q.token,
    callbackURL: safeNext(q.callbackURL),
    newUserCallbackURL: safeNext(q.newUserCallbackURL ?? q.callbackURL),
    errorCallbackURL: "/sign-in?via=link",
  });
  const href = `/api/auth/magic-link/verify?${verify.toString()}`;
  return (
    <div className={s.auth}>
      <section className={`${s.form} app-bg`}>
        <Logo href={siteUrl("/")} label="41Prompts, home" size={21} />
        <div className={s.card}>
          <span className="sheetno">Sheet A01 · Access</span>
          <h1>Finish signing in</h1>
          <p>Continue to open 41prompts. The link works once and expires 15 minutes after it was sent.</p>
          <div className={`frame frame--quiet ${s.panel}`}>
            <ContinueButton href={href} />
            <noscript>
              <a className="btn btn--block" href={href}>Continue without JavaScript</a>
            </noscript>
          </div>
        </div>
      </section>
      <MarkSheet />
    </div>
  );
}
