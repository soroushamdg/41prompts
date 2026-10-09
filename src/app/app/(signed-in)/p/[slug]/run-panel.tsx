"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/icon";
import { Troubleshoot } from "@/components/models/local-help";
import { useReviewPrompt } from "@/components/review/review";
import { PerfButton } from "@/components/upgrade/upgrade";
import { track } from "@/lib/analytics";
import { getLocalSecret, runInBrowser, setLocalSecret, subscribeLocalSecrets, UnreachableError } from "@/lib/browser-run";
import { costUsd, formatCost, formatPrice, providerName } from "@/lib/catalog";
import { cx } from "@/lib/cx";
import type { RunEvent } from "@/lib/run-events";
import type { ConnectionView } from "@/server/connections";
import s from "./editor.module.css";

/* Run (M06): the compiled prompt, once, on one of the user's models. Hosted
   models run on our server with the user's key; models on their own machine
   run straight from this browser. The reply streams in with tokens, time and
   cost; the provider bills the user's own account. */

type Props = { storageKey: string; userId: string; models: ConnectionView[]; system: string; missing: string[] };
type Stats = { tokens: number | null; exact: boolean; ms: number; cost: number | null };

const fmtMs = (ms: number) => `${Math.round(ms).toLocaleString("en-US")} ms`;

function load(key: string): { model?: string; message?: string } {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}");
  } catch {
    return {};
  }
}

/** Reads a run's events from /api/run's NDJSON stream. */
async function* serverRun(connectionId: string, system: string, message: string, signal: AbortSignal): AsyncGenerator<RunEvent> {
  const res = await fetch("/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ connectionId, system, message }), signal });
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
    for (const line of lines) if (line.trim()) yield JSON.parse(line) as RunEvent;
  }
}

export function RunPanel({ storageKey, userId, models, system, missing }: Props) {
  const [choice, setChoice] = useState(() => models[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [running, setRunning] = useState(false);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<React.ReactNode>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [stats, setStats] = useState<Stats>({ tokens: 0, exact: true, ms: 0, cost: 0 });
  const [meter, setMeter] = useState(0);
  const [ran, setRan] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const abort = useRef<AbortController | null>(null);
  const { askForReview } = useReviewPrompt();

  // Restore the last model and test message for this prompt (this device only).
  useEffect(() => {
    const saved = load(storageKey);
    queueMicrotask(() => {
      if (saved.message) setMessage(saved.message);
      if (saved.model && models.some((x) => x.id === saved.model)) setChoice(saved.model);
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

  const model = models.find((x) => x.id === choice);
  const localKey = useSyncExternalStore(
    subscribeLocalSecrets,
    () => (model?.runsIn === "browser" ? getLocalSecret(userId, model.id) : undefined),
    () => undefined,
  );
  const needsKey = Boolean(model?.runsIn === "browser" && model.settings.localKey && !localKey);
  const providers = [...new Set(models.map((x) => x.provider))];

  async function run() {
    if (!model || !message.trim() || needsKey) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setRunning(true);
    setRan(true);
    setReply("");
    setError(null);
    setUnreachable(false);
    setMeter(0);
    const t0 = performance.now();
    const inputEst = Math.round((system.length + message.length) / 4);
    const est = (out: number) => costUsd(model.price, inputEst, out);
    let text = "";
    const tick = window.setInterval(() => setStats((st) => (st.exact ? st : { ...st, ms: performance.now() - t0 })), 100);
    setStats({ tokens: 0, exact: false, ms: 0, cost: est(0) });
    try {
      const events =
        model.runsIn === "browser"
          ? runInBrowser({ provider: model.provider, baseURL: model.settings.baseURL ?? "", apiKey: localKey, modelId: model.modelId, includeUsage: model.settings.includeUsage ?? true }, model.label, system, message, model.price, ctrl.signal)
          : serverRun(model.id, system, message, ctrl.signal);
      for await (const e of events) {
        if (e.t === "delta") {
          text += e.text;
          setReply(text);
          const out = Math.round(text.length / 4);
          setMeter(Math.min(0.95, 1 - Math.exp(-out / 250)));
          setStats({ tokens: inputEst + out, exact: false, ms: performance.now() - t0, cost: est(out) });
        } else if (e.t === "done") {
          setMeter(1);
          const tokens = e.inputTokens !== null && e.outputTokens !== null ? e.inputTokens + e.outputTokens : null;
          setStats({ tokens, exact: true, ms: e.ms, cost: e.cost });
          track("run_completed", { provider: model.provider, runsIn: model.runsIn, ms: e.ms, outputTokens: e.outputTokens });
          askForReview("run_completed");
        } else if (e.t === "error") {
          setError(e.message);
        }
      }
    } catch (e) {
      if (ctrl.signal.aborted) setError(model.runsIn === "browser" ? "Stopped." : "Stopped. The provider may still bill the tokens it produced.");
      else if (e instanceof UnreachableError) {
        setError("Your browser could not reach the server.");
        setUnreachable(true);
      } else if ((e as { code?: string }).code === "no_key" || (e as { code?: string }).code === "no_model")
        setError(<>{(e as Error).message} <Link href="/settings#models">Open Settings</Link></>);
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
        <label className="label" htmlFor="runModel">Model · runs on your account</label>
        {models.length ? (
          <select className="input" id="runModel" value={choice} onChange={(e) => setChoice(e.target.value)} disabled={running}>
            {providers.map((p) => (
              <optgroup key={p} label={providerName(p)}>
                {models
                  .filter((x) => x.provider === p)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label} · {x.modelId}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        ) : (
          <p className={s.note}>
            No models yet. <Link href="/settings?add=1#models">Add a model</Link> to run this prompt on your own account.
          </p>
        )}
        {model && (
          <p className={s.note}>
            {model.runsIn === "server" ? `Runs on our server with your ${providerName(model.provider)} key${model.secretHint ? ` ending ${model.secretHint}` : ""}.` : `Runs in this browser, straight to ${model.settings.baseURL}.`}{" "}
            {formatPrice(model.price)}.
          </p>
        )}
      </div>
      {needsKey && model && (
        <form
          className={s.keyform}
          onSubmit={(e) => {
            e.preventDefault();
            if (!keyDraft.trim()) return;
            setLocalSecret(userId, model.id, keyDraft.trim());
            setKeyDraft("");
          }}
        >
          <label className="sr-only" htmlFor="runLocalKey">Key for {model.label}</label>
          <input className="input input--mono" id="runLocalKey" type="password" autoComplete="off" spellCheck={false} placeholder={`Key for ${model.label} · stays in this browser`} value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} />
          <button className="btn btn--sm" type="submit" disabled={!keyDraft.trim()}>Use key</button>
        </form>
      )}
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
        <button className="btn btn--primary btn--block" type="button" onClick={run} disabled={!model || !message.trim() || needsKey}>
          <Icon name="play" />
          <span>{ran ? "Run again" : "Run once"}</span>
        </button>
      )}
      <div className={s.runmeter} aria-hidden="true"><i style={{ width: `${meter * 100}%` }} /></div>
      <div className={cx(s.runout)} aria-live="polite" data-empty={!ran ? "" : undefined} data-error={error && !reply ? "" : undefined}>
        {!ran ? (
          <>Runs the compiled prompt once on one model.{"\n"}Your provider bills your own account.</>
        ) : (
          <>
            {reply}
            {running && <span className={s.caret} />}
            {error && (reply ? <span className={s.runErr}>{"\n\n"}{error}</span> : error)}
          </>
        )}
      </div>
      {unreachable && model && <Troubleshoot provider={model.provider} baseURL={model.settings.baseURL ?? ""} open />}
      <div className={s.runstats}>
        <span>Tokens <b>{stats.tokens === null ? "—" : `${stats.exact ? "" : "≈ "}${stats.tokens.toLocaleString("en-US")}`}</b></span>
        <span>Time <b>{fmtMs(stats.ms)}</b></span>
        <span>Cost <b>{stats.exact || stats.cost === null ? "" : "≈ "}{formatCost(stats.cost)}</b></span>
      </div>
      <PerfButton feature="Side-by-side runs" className="btn--block"><Icon name="columns" />Run on several models <span className="stamp">Performance</span></PerfButton>
    </>
  );
}
