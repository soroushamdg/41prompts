"use client";
import { zipSync } from "fflate";
import { useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { setAnalyticsSink, track } from "@/lib/analytics";
import { cx } from "@/lib/cx";
import { clearLocalDrafts } from "@/lib/drafts";
import { exportFileName, exportFiles, type ExportPrompt } from "@/lib/export";
import { deleteAccountAction } from "@/server/actions/account";
import s from "./settings.module.css";

type Progress = { pct: number; label: string };

/** Data and privacy: export everything (M09) and delete the account (M10). */
export function DataSection({ prompts, versions }: { prompts: number; versions: number }) {
  const toast = useToast();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [ready, setReady] = useState<{ url: string; name: string; size: string } | null>(null);
  const [confirm, setConfirm] = useState("");
  const [shake, setShake] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function runExport() {
    setReady(null);
    const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
    setProgress({ pct: 2, label: `Packing ${plural(prompts, "prompt")}, ${plural(versions, "version")}` });
    try {
      const all: ExportPrompt[] = [];
      let total = prompts;
      for (let offset = 0; offset === 0 || offset < total; ) {
        const res = await fetch(`/api/export?offset=${offset}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const page = (await res.json()) as { total: number; versions: number; prompts: ExportPrompt[] };
        total = page.total;
        all.push(...page.prompts);
        offset += page.prompts.length;
        setProgress({ pct: Math.round(5 + 65 * (total ? offset / total : 1)), label: `Packing ${plural(total, "prompt")}, ${plural(page.versions, "version")} · ${Math.round(100 * (total ? offset / total : 1))}%` });
        if (!page.prompts.length) break;
      }
      const name = exportFileName();
      const files = exportFiles(all, new Date().toISOString(), (stage) => setProgress({ pct: stage === "markdown" ? 76 : 84, label: stage === "markdown" ? "Writing Markdown" : "Writing JSON" }));
      setProgress({ pct: 92, label: "Compressing" });
      await new Promise((r) => setTimeout(r, 30));
      const zip = zipSync(files, { level: 6 });
      const url = URL.createObjectURL(new Blob([zip.buffer as ArrayBuffer], { type: "application/zip" }));
      const size = zip.byteLength < 1024 * 1024 ? `${Math.max(1, Math.round(zip.byteLength / 1024))} KB` : `${(zip.byteLength / 1024 / 1024).toFixed(1)} MB`;
      setProgress({ pct: 100, label: `Ready · ${name} · ${size}` });
      setReady({ url, name, size });
      track("export_completed", { prompts: all.length });
      download(url, name);
    } catch {
      setProgress(null);
      toast("The export did not finish. Try again.", { tone: "bad" });
    }
  }

  function download(url: string, name: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function remove(e: React.FormEvent) {
    e.preventDefault();
    if (confirm !== "DELETE") {
      setShake((n) => n + 1);
      input.current?.focus();
      return;
    }
    setDeleting(true);
    const r = await deleteAccountAction(confirm);
    if (!r.ok) {
      setDeleting(false);
      return toast(r.error, { tone: "bad", ms: 8000 });
    }
    track("account_deleted");
    setAnalyticsSink(null);
    clearLocalDrafts();
    window.location.replace(`/goodbye?p=${r.prompts}&v=${r.versions}&m=${r.models}`);
  }

  const busy = progress !== null && progress.pct < 100;
  return (
    <>
      <div className={s.box}>
        <div className={s.row}>
          <div className={s.rowMain}>
            <b>Private by default</b>
            <span>Every prompt and version is visible only to you. Nothing becomes public unless you create a share page.</span>
          </div>
          <span className={s.always}><span className="toggle" aria-hidden="true" />Always on</span>
        </div>
        <div className={s.row}>
          <div className={s.rowMain}>
            <b>Export everything</b>
            <span>Your whole library with every version, as Markdown and JSON in one .zip file.</span>
          </div>
          {ready ? (
            <button className="btn btn--sm" type="button" onClick={() => download(ready.url, ready.name)}><Icon name="download" />Download .zip</button>
          ) : (
            <button className={cx("btn btn--sm", busy && "is-busy")} type="button" onClick={runExport} disabled={busy}>
              <span className="btn-spin" aria-hidden="true" />
              <Icon name="download" />Export
            </button>
          )}
          {progress && (
            <div className={s.exportState} role="status">
              <div className="progress"><i style={{ width: `${progress.pct}%` }} /></div>
              <span className="mono muted" style={{ fontSize: 11.5 }}>{progress.label}</span>
            </div>
          )}
        </div>
      </div>
      <div className={cx("frame", s.danger)}>
        <b>Delete account</b>
        <p>Deletes your account, every prompt, every version and your saved keys. This cannot be undone. Export first if you want a copy.</p>
        <form className={s.dangerForm} onSubmit={remove} noValidate>
          <div className="field">
            <label className="label" htmlFor="delConfirm" style={{ color: "var(--chalk-2)" }}>Type DELETE to confirm</label>
            <input
              ref={input}
              key={shake}
              className={cx("input input--mono", shake > 0 && s.shake)}
              id="delConfirm"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <button className={cx("btn btn--danger", deleting && "is-busy")} type="submit" disabled={confirm !== "DELETE" || deleting}>
            <span className="btn-spin" aria-hidden="true" />
            {deleting ? "Deleting everything" : "Delete account"}
          </button>
        </form>
      </div>
    </>
  );
}
