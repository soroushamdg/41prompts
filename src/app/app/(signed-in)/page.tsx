import Link from "next/link";
import { Icon } from "@/components/icon";
import { SearchHotkey } from "@/components/search-hotkey";
import page from "@/components/shell/page.module.css";
import { Topbar } from "@/components/shell/topbar";
import { db } from "@/db";
import { keysNotice } from "@/lib/providers";
import { connectedProviders } from "@/server/keys-summary";
import { listPrompts } from "@/server/prompts";
import { requireViewer } from "@/server/session";
import { Library } from "./library";

export const metadata = { title: "Library" };

export default async function LibraryPage() {
  const viewer = await requireViewer();
  const [items, providers] = await Promise.all([listPrompts(db, viewer.id), connectedProviders(db, viewer.id)]);
  const active = items.filter((p) => !p.archived).length;
  const notice = keysNotice(providers);
  return (
    <>
      <Topbar />
      <main className={`${page.page} app-bg`} id="main">
        <div className={page.head}>
          <div>
            <span className="sheetno">Sheet A02 · Library · {active} {active === 1 ? "prompt" : "prompts"}</span>
            <h1>Library</h1>
            <p><Icon name="lock" />Private by default. Nothing here is public unless you share it.</p>
          </div>
          <div className={page.actions}>
            <Link className="btn" href="/settings#data"><Icon name="download" />Export all</Link>
            <Link className="btn btn--primary btn--go" href="/new"><Icon name="plus" />New prompt</Link>
          </div>
        </div>
        {notice && (
          <div className="notice">
            <Icon name="key" />
            <span>{notice}</span>
            <Link className="btn btn--sm" href="/settings#keys">Manage keys</Link>
          </div>
        )}
        <Library initial={items} />
        <SearchHotkey />
      </main>
    </>
  );
}
