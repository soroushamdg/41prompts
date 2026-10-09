import page from "@/components/shell/page.module.css";
import { Topbar } from "@/components/shell/topbar";
import { NewPrompt } from "./new-prompt";

export const metadata = { title: "New prompt" };

export default function NewPromptPage() {
  return (
    <>
      <Topbar />
      <main className={`${page.page} ${page.narrow} app-bg`} id="main">
        <div className={page.head}>
          <div>
            <span className="sheetno">Sheet A03 · New prompt</span>
            <h1>Paste a prompt, or start blank.</h1>
            <p>It stays private to you and saves itself as you go.</p>
          </div>
        </div>
        <NewPrompt />
      </main>
    </>
  );
}
