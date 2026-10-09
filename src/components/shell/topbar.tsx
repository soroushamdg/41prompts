import Link from "next/link";
import { Logo } from "@/components/logo";
import { PRICING_ENABLED } from "@/lib/env";
import { requireViewer } from "@/server/session";
import { AccountMenu } from "./account-menu";
import { AppNav } from "./app-nav";
import s from "./shell.module.css";

/** The app's top bar: logo, nav (or the editor's breadcrumb), plan pill, account. */
export async function Topbar({ crumb }: { crumb?: React.ReactNode }) {
  const viewer = await requireViewer();
  return (
    <header className={s.topbar}>
      <Logo href="/" label="41Prompts, library" />
      {crumb ? (
        <nav className={s.crumbs} aria-label="Breadcrumb">
          <Link href="/">Library</Link>
          <span aria-hidden="true">/</span>
          <b>{crumb}</b>
        </nav>
      ) : (
        <AppNav />
      )}
      <div className={s.end}>
        {viewer.plan === "performance" ? (
          <Link className={s.pill} href="/settings#billing">
            <span className="stamp">Performance</span>
          </Link>
        ) : PRICING_ENABLED ? (
          <Link className={s.pill} href="/settings#billing" data-upgrade="">
            Free plan <span className="stamp">Upgrade</span>
          </Link>
        ) : (
          <Link className={s.pill} href="/settings#billing">
            Free plan
          </Link>
        )}
        <AccountMenu name={viewer.name} email={viewer.email} />
      </div>
    </header>
  );
}
