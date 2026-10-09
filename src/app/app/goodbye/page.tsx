import { Logo } from "@/components/logo";
import { siteUrl } from "@/lib/hosts";
import s from "../sign-in/sign-in.module.css";

export const metadata = { title: "Account deleted" };

const n = (v: string | undefined) => Math.max(0, Number(v) || 0);
const plural = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;

/** After M10: say in plain words what was removed. */
export default async function GoodbyePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const [p, v, k] = [n(q.p), n(q.v), n(q.k)];
  return (
    <div className={s.auth} style={{ gridTemplateColumns: "1fr" }}>
      <section className={`${s.form} app-bg`} style={{ alignItems: "center" }}>
        <Logo href={siteUrl("/")} label="41Prompts, home" size={21} />
        <div className={s.card}>
          <span className="sheetno">Sheet A00 · Closed</span>
          <h1>Your account is deleted.</h1>
          <p>
            We removed your account, {plural(p, "prompt")}, {plural(v, "version")} and {plural(k, "saved model key")}. Your sessions are signed out. This cannot be undone, and nothing is kept.
          </p>
          <p>If you had Performance, the subscription is cancelled and you will not be billed again.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a className="btn btn--primary" href={siteUrl("/")}>Go to 41prompts.ai</a>
            <a className="btn" href="/sign-in#start">Start over with a new account</a>
          </div>
        </div>
      </section>
    </div>
  );
}
