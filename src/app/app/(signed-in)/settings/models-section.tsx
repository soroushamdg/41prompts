"use client";
import { useState } from "react";
import { Dialog } from "@/components/dialog";
import { Icon } from "@/components/icon";
import { Troubleshoot } from "@/components/models/local-help";
import m from "@/components/models/models.module.css";
import { useToast } from "@/components/toast";
import { track } from "@/lib/analytics";
import { getLocalSecret, listModelsInBrowser, setLocalSecret, UnreachableError } from "@/lib/browser-run";
import { formatPrice, providerName } from "@/lib/catalog";
import { cx } from "@/lib/cx";
import { recordBrowserTestAction, removeModelAction, testModelAction } from "@/server/actions/models";
import type { ConnectionView } from "@/server/connections";
import { type DialogMode, ModelDialog } from "./model-dialog";
import s from "./settings.module.css";

type RowState = { kind: "idle" | "testing" } | { kind: "bad"; message: string; unreachable?: boolean };

/** Your models (M07): any provider, any number, each with its own label. */
export function ModelsSection({ initial, userId, openAdd }: { initial: ConnectionView[]; userId: string; openAdd: boolean }) {
  const toast = useToast();
  const [models, setModels] = useState(initial);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [dialog, setDialog] = useState<{ open: boolean; session: number; mode: DialogMode }>({ open: openAdd, session: 0, mode: { kind: "add" } });
  const [confirm, setConfirm] = useState<ConnectionView | null>(null);
  const setRow = (id: string, st: RowState) => setRows((x) => ({ ...x, [id]: st }));

  const openDialog = (mode: DialogMode) => setDialog((d) => ({ open: true, session: d.session + 1, mode }));
  const closeDialog = () => {
    setDialog((d) => ({ ...d, open: false }));
    // Opened from a link with ?add=1: do not open again on reload.
    const url = new URL(window.location.href);
    if (url.searchParams.has("add")) {
      url.searchParams.delete("add");
      window.history.replaceState(window.history.state, "", url);
    }
  };

  function saved(model: ConnectionView, kind: DialogMode["kind"]) {
    closeDialog();
    setModels((ms) => (kind === "edit" ? ms.map((x) => (x.id === model.id ? model : x)) : [...ms, model]));
    setRow(model.id, model.lastTest && !model.lastTest.ok ? { kind: "bad", message: model.lastTest.message ?? "Did not work.", unreachable: model.runsIn === "browser" } : { kind: "idle" });
    if (kind !== "edit") track("model_added", { provider: model.provider, runsIn: model.runsIn });
    toast(kind === "edit" ? `Saved ${model.label}.` : `Added ${model.label}.`);
  }

  async function test(c: ConnectionView) {
    setRow(c.id, { kind: "testing" });
    if (c.runsIn === "browser") {
      let result: { ok: boolean; ms: number | null; message: string | null };
      let unreachable = false;
      try {
        const r = await listModelsInBrowser(c.provider, providerName(c.provider), c.settings.baseURL ?? "", getLocalSecret(userId, c.id));
        const has = !r.models.length || r.models.some((x) => x.id === c.modelId);
        result = has ? { ok: true, ms: r.ms, message: null } : { ok: false, ms: null, message: `The server answered, but ${c.modelId} is not in its list.` };
      } catch (e) {
        unreachable = e instanceof UnreachableError;
        result = { ok: false, ms: null, message: unreachable ? "Your browser could not reach the server." : (e as Error).message };
      }
      void recordBrowserTestAction(c.id, result).catch(() => null);
      update(c.id, { at: new Date().toISOString(), ...result });
      setRow(c.id, result.ok ? { kind: "idle" } : { kind: "bad", message: result.message ?? "Did not work.", unreachable });
      return;
    }
    const r = await testModelAction(c.id).catch(() => ({ ok: false as const, error: "Something went wrong on our side. Try again." }));
    if (r.ok) {
      update(c.id, { at: r.at, ok: true, ms: r.ms, message: null });
      setRow(c.id, { kind: "idle" });
    } else {
      if ("at" in r && r.at) update(c.id, { at: r.at, ok: false, ms: null, message: r.error });
      setRow(c.id, { kind: "bad", message: r.error });
    }
  }

  function update(id: string, lastTest: ConnectionView["lastTest"]) {
    setModels((ms) => ms.map((x) => (x.id === id ? { ...x, lastTest } : x)));
  }

  async function remove(c: ConnectionView) {
    setConfirm(null);
    const r = await removeModelAction(c.id).catch(() => ({ ok: false }));
    if (!r.ok) return toast("The model was not removed. Try again.", { tone: "bad" });
    setLocalSecret(userId, c.id, undefined);
    setModels((ms) => ms.filter((x) => x.id !== c.id));
    toast(`Removed ${c.label}.`);
  }

  return (
    <>
      <div className={m.head}>
        <p>Bring any model: a hosted provider with your own key, any OpenAI-compatible endpoint, or a model on your own computer. Each provider bills your own account.</p>
        {models.length > 0 && (
          <button className="btn btn--primary btn--sm" type="button" onClick={() => openDialog({ kind: "add" })}>
            <Icon name="plus" />Add model
          </button>
        )}
      </div>
      <div className={s.box}>
        {models.length === 0 ? (
          <div className={m.empty}>
            <Icon name="cpu" size="lg" />
            <p>No models yet. Add one to run prompts on your own account.</p>
            <button className="btn btn--primary" type="button" onClick={() => openDialog({ kind: "add" })}>
              <Icon name="plus" />Add model
            </button>
          </div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }} aria-label="Your models">
            {models.map((c) => {
              const st = rows[c.id] ?? { kind: "idle" };
              const t = c.lastTest;
              const badge: [string, string] =
                st.kind === "testing" ? ["is-test", "Testing"] : t ? (t.ok ? ["is-ok", t.ms !== null ? `Works · ${t.ms} ms` : "Works"] : ["is-bad", "Did not work"]) : ["", "Not tested"];
              return (
                <li className={m.row} key={c.id} data-model={c.label}>
                  <div className={m.rowMain}>
                    <b>{c.label}</b>
                    <span className={m.meta}>
                      <span>{providerName(c.provider)}</span>
                      <span className="mono">{c.modelId}</span>
                    </span>
                    <span className={m.meta}>
                      {c.runsIn === "server" ? (
                        <span className={m.where}><Icon name="server" />Our server{c.secretHint ? ` · key ending ${c.secretHint}` : ""}</span>
                      ) : (
                        <span className={m.where}><Icon name="monitor" />Your browser · <span className="mono">{c.settings.baseURL}</span></span>
                      )}
                      <span>{formatPrice(c.price)}</span>
                    </span>
                  </div>
                  <div className={m.rowSide}>
                    <span className={cx("keystate", badge[0])} role="status"><span className="dot" /><span>{badge[1]}</span></span>
                    <span className={m.acts}>
                      <button className="btn btn--sm" type="button" onClick={() => void test(c)} disabled={st.kind === "testing"} aria-label={`Test ${c.label}`}>Test</button>
                      <button className="btn btn--sm" type="button" onClick={() => openDialog({ kind: "edit", model: c })} aria-label={`Edit ${c.label}`}>Edit</button>
                      <button className="btn btn--sm" type="button" onClick={() => openDialog({ kind: "duplicate", model: c })} aria-label={`Duplicate ${c.label}`}>Duplicate</button>
                      <button className="btn btn--sm" type="button" onClick={() => setConfirm(c)} aria-label={`Remove ${c.label}`}>Remove</button>
                    </span>
                  </div>
                  {st.kind === "bad" && <p className={m.rowNote} role="alert">{st.message}</p>}
                  {st.kind === "bad" && st.unreachable && <div className={m.rowHelp}><Troubleshoot provider={c.provider} baseURL={c.settings.baseURL ?? ""} /></div>}
                </li>
              );
            })}
          </ul>
        )}
        <div className={m.foot}><Icon name="lock" />Keys are encrypted at rest, shown once when you save them and never again, and never written to logs. Keys for models in your browser stay in your browser.</div>
      </div>

      <ModelDialog
        open={dialog.open}
        session={dialog.session}
        mode={dialog.mode}
        userId={userId}
        taken={models.filter((x) => dialog.mode.kind !== "edit" || x.id !== dialog.mode.model.id).map((x) => x.label)}
        onClose={closeDialog}
        onSaved={saved}
      />

      <Dialog open={confirm !== null} onClose={() => setConfirm(null)} labelledBy="removeModelTitle">
        <div className="dlg__panel frame">
          <h2 id="removeModelTitle" style={{ margin: 0, fontFamily: "var(--f-display)", fontSize: 24 }}>Remove {confirm?.label}?</h2>
          <p style={{ margin: 0, color: "var(--chalk-2)" }}>
            {confirm?.runsIn === "server"
              ? "Its key is deleted from 41prompts. The key stays valid at the provider, and other models that use the same key keep working."
              : "It is removed from your list, and its key is cleared from this browser. Your server is not touched."}
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="btn" type="button" onClick={() => setConfirm(null)}>Keep it</button>
            <button className="btn btn--danger" type="button" onClick={() => confirm && void remove(confirm)}>Remove model</button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
