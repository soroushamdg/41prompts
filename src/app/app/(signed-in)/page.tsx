import Link from "next/link";
import { Icon } from "@/components/icon";
import { SearchHotkey } from "@/components/search-hotkey";
import page from "@/components/shell/page.module.css";
import { Topbar } from "@/components/shell/topbar";
import { db } from "@/db";
import { countConnections } from "@/server/connections";
import { listPrompts } from "@/server/prompts";
import { requireViewer } from "@/server/session";
import { Library } from "./library";

export const metadata = { title: "Library" };

export default async function LibraryPage() {
  const viewer = await requireViewer();
  const [items, modelCount] = await Promise.all([listPrompts(db, viewer.id), countConnections(db, viewer.id)]);
  const active = items.filter((p) => !p.archived).length;
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
        {modelCount === 0 && (
          <div className="notice">
            <Icon name="cpu" />
            <span>No models yet. Add one to run prompts on your own account.</span>
            <Link className="btn btn--sm" href="/settings?add=1#models">Add a model</Link>
          </div>
        )}
        <Library initial={items} />
        <SearchHotkey />
      </main>
    </>
  );
}
