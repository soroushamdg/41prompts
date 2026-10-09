"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { PerfButton } from "@/components/upgrade/upgrade";
import type { Provider } from "@/db/schema";
import type { RunEvent } from "@/app/api/run/route";
import { track } from "@/lib/analytics";
import { cx } from "@/lib/cx";
import { costUsd, formatCost, MODELS } from "@/lib/models";
import { PROVIDER_LABEL, PROVIDER_ORDER } from "@/lib/providers";
import type { KeySummary } from "@/server/keys";
import s from "./editor.module.css";

/* Run (M06): the compiled prompt, once, on one model, with the user's key.
   The reply streams in with tokens, time and cost; the provider bills the key. */

type Props = { storageKey: string; keys: KeySummary[]; system: string; missing: string[] };
type Stats = { tokens: number; exact: boolean; ms: number; cost: number | null };

const fmtMs = (ms: number) => `${Math.round(ms).toLocaleString("en-US")} ms`;

function load(key: string): { model?: string; message?: string } {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}");
  } catch {
    return {};
  }
}

export function RunPanel({ storageKey, keys, system, missing }: Props) {
  const has = new Map(keys.map((k) => [k.provider, k]));
  const firstAvailable = PROVIDER_ORDER.find((p) => has.has(p));
  const [choice, setChoice] = useState(() => (firstAvailable ? `${firstAvailable}:${MODELS[firstAvailable][0]!.id}` : ""));
  const [message, setMessage] = useState("");
  const [running, setRunning] = useState(false);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<React.ReactNode>(null);
  const [stats, setStats] = useState<Stats>({ tokens: 0, exact: true, ms: 0, cost: 0 });
  const [meter, setMeter] = useState(0);
  const [ran, setRan] = useState(false);
  const abort = useRef<AbortController | null>(null);

  // Restore the last model and test message for this prompt (this device only).
  useEffect(() => {
    const saved = load(storageKey);
    queueMicrotask(() => {
      if (saved.message) setMessage(saved.message);
      if (saved.model) {
        const [p] = saved.model.split(":") as [Provider];
        if (has.has(p) && MODELS[p].some((m) => `${p}:${m.id}` === saved.model)) setChoice(saved.model);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ model: choice, message }));
    } catch {
      /* storage unavailable */
    }
  }, [storageKey, choice, message]);
  useEffect(() => () => abort.current?.abort(), []);

  const [provider, model] = choice.split(":") as [Provider, string];

  async function run() {
    if (!choice || !message.trim()) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setRunning(true);
    setRan(true);
    setReply("");
    setError(null);
    setMeter(0);
    const t0 = performance.now();
    const inputEst = Math.round((system.length + message.length) / 4);
    let text = "";
    const tick = window.setInterval(() => setStats((st) => (st.exact ? st : { ...st, ms: performance.now() - t0 })), 100);
    setStats({ tokens: 0, exact: false, ms: 0, cost: costUsd(provider, model, inputEst, 0) });
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, model, system, message }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw Object.assign(new Error(body.error ?? "The run did not start."), { code: body.code });
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as RunEvent;
          if (e.t === "delta") {
            text += e.text;
            setReply(text);
            const out = Math.round(text.length / 4);
            setMeter(Math.min(0.95, 1 - Math.exp(-out / 250)));
            setStats({ tokens: inputEst + out, exact: false, ms: performance.now() - t0, cost: costUsd(provider, model, inputEst, out) });
          } else if (e.t === "done") {
            setMeter(1);
            setStats({ tokens: e.inputTokens + e.outputTokens, exact: true, ms: e.ms, cost: e.cost });
            track("run_completed", { provider, model, ms: e.ms, outputTokens: e.outputTokens });
          } else if (e.t === "error") {
            setError(e.message);
          }
        }
      }
    } catch (e) {
      if (ctrl.signal.aborted) setError("Stopped. The provider may still bill the tokens it produced.");
      else if ((e as { code?: string }).code === "no_key")
        setError(<>{(e as Error).message} <Link href="/settings#keys">Open Settings</Link></>);
      else setError((e as Error).message || "The run did not finish.");
    } finally {
      window.clearInterval(tick);
      setStats((st) => ({ ...st, exact: true }));
      setRunning(false);
      abort.current = null;
    }
  }

  return (
    <>
      <div className="field">
        <label className="label" htmlFor="runModel">Model · runs on your key</label>
        <select className="input" id="runModel" value={choice} onChange={(e) => setChoice(e.target.value)} disabled={running}>
          {!firstAvailable && <option value="">Add a model key in Settings first</option>}
          {PROVIDER_ORDER.map((p) => {
            const k = has.get(p);
            return (
              <optgroup key={p} label={k ? `${PROVIDER_LABEL[p]} · key ending ${k.last4}` : `${PROVIDER_LABEL[p]} · add a key in Settings`}>
                {MODELS[p].map((m) => (
                  <option key={m.id} value={`${p}:${m.id}`} disabled={!k}>
                    {PROVIDER_LABEL[p]} · {m.label}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </div>
      <div className="field">
        <label className="label" htmlFor="runInput">Test message</label>
        <textarea className="input" id="runInput" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What a user would send. The compiled prompt goes in as the system prompt." />
      </div>
      {missing.length > 0 && (
        <p className={s.note}>
          {missing.map((v) => `{{${v}}}`).join(", ")} {missing.length === 1 ? "has" : "have"} no value yet, so the model sees the placeholder. Fill {missing.length === 1 ? "it" : "them"} in on the Compiled tab.
        </p>
      )}
      {running ? (
        <button className="btn btn--block" type="button" onClick={() => abort.current?.abort()}>
          <Icon name="x" />Stop
        </button>
      ) : (
        <button className="btn btn--primary btn--block" type="button" onClick={run} disabled={!choice || !message.trim()}>
          <Icon name="play" />
          <span>{ran ? "Run again" : "Run once"}</span>
        </button>
      )}
      <div className={s.runmeter} aria-hidden="true"><i style={{ width: `${meter * 100}%` }} /></div>
      <div className={cx(s.runout)} aria-live="polite" data-empty={!ran ? "" : undefined} data-error={error && !reply ? "" : undefined}>
        {!ran ? (
          <>Runs the compiled prompt once on one model.{"\n"}Your provider bills your key.</>
        ) : (
          <>
            {reply}
            {running && <span className={s.caret} />}
            {error && (reply ? <span className={s.runErr}>{"\n\n"}{error}</span> : error)}
          </>
        )}
      </div>
      <div className={s.runstats}>
        <span>Tokens <b>{stats.exact ? "" : "≈ "}{stats.tokens.toLocaleString("en-US")}</b></span>
        <span>Time <b>{fmtMs(stats.ms)}</b></span>
        <span>Cost <b>{stats.exact ? "" : "≈ "}{formatCost(stats.cost)}</b></span>
      </div>
      <PerfButton feature="Side-by-side runs" className="btn--block"><Icon name="columns" />Run on all 3 models <span className="stamp">Performance</span></PerfButton>
    </>
  );
}
