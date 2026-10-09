"use client";
import { useState } from "react";
import { Dialog } from "@/components/dialog";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import type { Provider } from "@/db/schema";
import { track } from "@/lib/analytics";
import { cx } from "@/lib/cx";
import { PROVIDER_LABEL, PROVIDER_MODEL_FAMILY, PROVIDER_ORDER } from "@/lib/providers";
import { shortDate } from "@/lib/time";
import { removeKeyAction, saveKeyAction, testKeyAction } from "@/server/actions/keys";
import type { KeySummary } from "@/server/keys";
import s from "./settings.module.css";

type State = { kind: "idle" } | { kind: "testing" | "checking" } | { kind: "works"; ms: number } | { kind: "bad"; message: string };

const PLACEHOLDER: Record<Provider, string> = { openai: "Paste your OpenAI API key", anthropic: "Paste your Anthropic API key", google: "Paste your Gemini API key" };

/** Model keys (M07): saved once, encrypted, never shown again. */
export function KeysSection({ initial }: { initial: KeySummary[] }) {
  const toast = useToast();
  const [keys, setKeys] = useState(initial);
  const [states, setStates] = useState<Partial<Record<Provider, State>>>({});
  const [drafts, setDrafts] = useState<Partial<Record<Provider, string>>>({});
  const [confirm, setConfirm] = useState<Provider | null>(null);
  const set = (p: Provider, st: State) => setStates((x) => ({ ...x, [p]: st }));

  async function save(p: Provider) {
    const value = drafts[p]?.trim() ?? "";
    if (value.length < 8) return;
    set(p, { kind: "checking" });
    const r = await saveKeyAction(p, value);
    if (!r.ok) return set(p, { kind: "bad", message: r.error });
    setDrafts((d) => ({ ...d, [p]: "" }));
    setKeys((ks) => [...ks.filter((k) => k.provider !== p), { provider: p, last4: r.last4, createdAt: r.createdAt }]);
    set(p, { kind: "idle" });
    track("key_saved", { provider: p });
    const count = keys.filter((k) => k.provider !== p).length + 1;
    toast(count === 3 ? `${PROVIDER_LABEL[p]} key saved. All 3 providers are connected.` : `${PROVIDER_LABEL[p]} key saved.`);
  }

  async function test(p: Provider) {
    set(p, { kind: "testing" });
    const r = await testKeyAction(p);
    set(p, r.ok ? { kind: "works", ms: r.ms } : { kind: "bad", message: r.error });
    if (r.ok) setTimeout(() => setStates((x) => (x[p]?.kind === "works" ? { ...x, [p]: { kind: "idle" } } : x)), 2600);
  }

  async function remove(p: Provider) {
    setConfirm(null);
    const r = await removeKeyAction(p);
    if (!r.ok) return toast("The key was not removed. Try again.", { tone: "bad" });
    setKeys((ks) => ks.filter((k) => k.provider !== p));
    set(p, { kind: "idle" });
    toast(`Removed your ${PROVIDER_LABEL[p]} key.`);
  }

  const now = new Date();
  return (
    <>
      <div className={s.box}>
        {PROVIDER_ORDER.map((p) => {
          const k = keys.find((x) => x.provider === p);
          const st = states[p] ?? { kind: "idle" };
          const badge =
            st.kind === "testing" ? ["is-test", "Testing"] : st.kind === "checking" ? ["is-test", "Checking key"] : st.kind === "works" ? ["is-ok", `Works · ${st.ms} ms`] : st.kind === "bad" && k ? ["is-bad", "Did not work"] : k ? ["is-ok", "Connected"] : ["", "Not connected"];
          return (
            <div className={s.row} key={p} data-key={p}>
              <div className={s.rowMain}>
                <b>{PROVIDER_LABEL[p]}</b>
                {k ? (
                  <span className="mono" suppressHydrationWarning>Key ending {k.last4} · added {shortDate(new Date(k.createdAt), now)}</span>
                ) : (
                  <span>Needed to run prompts on {PROVIDER_MODEL_FAMILY[p]}.</span>
                )}
              </div>
              <span className={cx("keystate", badge[0])} role="status"><span className="dot" /><span>{badge[1]}</span></span>
              {k ? (
                <span className={s.rowActs}>
                  <button className="btn btn--sm" type="button" onClick={() => test(p)} disabled={st.kind === "testing"}>Test connection</button>
                  <button className="btn btn--sm" type="button" onClick={() => setConfirm(p)} aria-label={`Remove ${PROVIDER_LABEL[p]} key`}>Remove</button>
                </span>
              ) : (
                <form className={s.keyform} onSubmit={(e) => { e.preventDefault(); void save(p); }} noValidate>
                  <label className="sr-only" htmlFor={`key-${p}`}>{PROVIDER_LABEL[p]} API key</label>
                  <input
                    className="input input--mono"
                    id={`key-${p}`}
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={PLACEHOLDER[p]}
                    value={drafts[p] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [p]: e.target.value }))}
                  />
                  <button className={cx("btn btn--primary btn--sm", st.kind === "checking" && "is-busy")} type="submit" disabled={(drafts[p]?.trim().length ?? 0) < 8 || st.kind === "checking"}>
                    <span className="btn-spin" aria-hidden="true" />
                    Save key
                  </button>
                </form>
              )}
              {st.kind === "bad" && <p className={s.keyErr} role="alert">{st.message}</p>}
            </div>
          );
        })}
        <div className={s.foot}><Icon name="lock" />Encrypted at rest. Shown once when you save it, never again, and never written to logs.</div>
      </div>
      <Dialog open={confirm !== null} onClose={() => setConfirm(null)} labelledBy="removeKeyTitle">
        <div className="dlg__panel frame">
          <h2 id="removeKeyTitle" style={{ margin: 0, fontFamily: "var(--f-display)", fontSize: 24 }}>Remove your {confirm ? PROVIDER_LABEL[confirm] : ""} key?</h2>
          <p style={{ margin: 0, color: "var(--chalk-2)" }}>Runs on {confirm ? PROVIDER_MODEL_FAMILY[confirm] : ""} stop until you add a key again. The key is deleted from 41prompts; it stays valid at the provider.</p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="btn" type="button" onClick={() => setConfirm(null)}>Keep it</button>
            <button className="btn btn--danger" type="button" onClick={() => confirm && remove(confirm)}>Remove key</button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
