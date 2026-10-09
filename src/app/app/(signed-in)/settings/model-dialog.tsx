"use client";
import { useRef, useState } from "react";
import { Dialog } from "@/components/dialog";
import { Icon } from "@/components/icon";
import { Troubleshoot, WorksIn } from "@/components/models/local-help";
import { ModelPicker } from "@/components/models/model-picker";
import m from "@/components/models/models.module.css";
import { getLocalSecret, listModelsInBrowser, setLocalSecret, UnreachableError } from "@/lib/browser-run";
import {
  destinationOf,
  draftProblem,
  type Field,
  freeLabel,
  GROUP_LABEL,
  type Group,
  parseHeaders,
  PRICES_CHECKED,
  type ProviderDef,
  PROVIDERS,
  providerById,
  type RunsIn,
  type Secret,
  type Settings,
  suggestRunsIn,
} from "@/lib/catalog";
import { cx } from "@/lib/cx";
import type { ModelEntry } from "@/lib/model-list";
import { type DraftInput, probeModelsAction, saveModelAction, suggestPriceAction, testMessageAction } from "@/server/actions/models";
import type { ConnectionView, PriceSource } from "@/server/connections";

/* Add, edit or duplicate one of the user's models (M07). Two screens: pick a
   provider, then connect it. Keys go to the server once, when saved, and
   never come back; keys for models in the browser never leave it. */

export type DialogMode = { kind: "add" } | { kind: "edit"; model: ConnectionView } | { kind: "duplicate"; model: ConnectionView };

type Props = { open: boolean; session: number; mode: DialogMode; userId: string; taken: string[]; onClose: () => void; onSaved: (model: ConnectionView, kind: DialogMode["kind"]) => void };

export function ModelDialog({ open, session, onClose, ...rest }: Props) {
  return (
    <Dialog open={open} onClose={onClose} labelledBy="modelDlgTitle" className={m.dlg}>
      <ModelForm key={session} onClose={onClose} {...rest} />
    </Dialog>
  );
}

type Conn = { kind: "idle" | "busy" } | { kind: "ok"; ms: number; count: number | null; checked: boolean } | { kind: "bad"; message: string; refused?: boolean; unreachable?: boolean };
type Test = { kind: "idle" | "busy" } | { kind: "ok"; ms: number } | { kind: "bad"; message: string };
type Price = { input: string; output: string; source: PriceSource | null };

const GROUPS: Group[] = ["popular", "more", "local", "custom"];
const checkedOn = new Date(`${PRICES_CHECKED}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const PRICE_NOTE: Record<PriceSource | "none", (name: string) => string> = {
  provider: (n) => `From ${n}'s model list.`,
  catalog: () => `List price, checked ${checkedOn}.`,
  openrouter: () => "Estimate from OpenRouter's public prices. Change it if yours differ.",
  local: () => "Runs on your own hardware, so a run costs nothing here.",
  user: () => "Set by you.",
  none: () => "No price known. Add one to see what each run costs, or leave it empty.",
};

const str = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));
const num = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));

function initialValues(def: ProviderDef | null, source: ConnectionView | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (source) for (const [k, v] of Object.entries(source.settings)) if (typeof v === "string") out[k] = v;
  if (def?.group === "local" && !out.baseURL && def.baseURL) out.baseURL = def.baseURL;
  return out;
}

function ModelForm({ mode, userId, taken, onClose, onSaved }: Omit<Props, "open" | "session">) {
  const source = mode.kind === "add" ? null : mode.model;
  const [def, setDef] = useState<ProviderDef | null>(() => (source ? (providerById(source.provider) ?? null) : null));
  const [query, setQuery] = useState("");
  const [label, setLabel] = useState(() => (!source ? "" : mode.kind === "edit" ? source.label : freeLabel(`${source.label} (copy)`, taken)));
  const [runsIn, setRunsIn] = useState<RunsIn>(source?.runsIn ?? "server");
  const [runsInTouched, setRunsInTouched] = useState(Boolean(source));
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(def, source));
  const [includeUsage, setIncludeUsage] = useState(source?.settings.includeUsage ?? true);
  const [storedLocal] = useState(() => (source?.runsIn === "browser" ? getLocalSecret(userId, source.id) : undefined));
  const hasStored = source ? (source.runsIn === "server" ? source.hasSecret : Boolean(storedLocal)) : false;
  const [replace, setReplace] = useState(!hasStored);
  const [conn, setConn] = useState<Conn>({ kind: "idle" });
  const [models, setModels] = useState<ModelEntry[]>(() => def?.suggested?.map((id) => ({ id })) ?? []);
  const [modelId, setModelId] = useState(source?.modelId ?? "");
  const [price, setPrice] = useState<Price>(() => (source ? { input: str(source.price.input), output: str(source.price.output), source: source.price.source } : { input: "", output: "", source: null }));
  const [test, setTest] = useState<Test>({ kind: "idle" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const priceTimer = useRef<number | undefined>(undefined);
  const latestModel = useRef(modelId);

  function choose(p: ProviderDef) {
    setDef(p);
    setLabel(freeLabel(p.name, taken));
    setRunsIn(p.runsIn === "either" ? "server" : p.runsIn);
    setValues(initialValues(p, null));
    setModels(p.suggested?.map((id) => ({ id })) ?? []);
  }

  /* ---- Screen 1: provider ---------------------------------------------------- */
  if (!def) {
    const needle = query.trim().toLowerCase();
    const shown = PROVIDERS.filter((p) => !needle || p.name.toLowerCase().includes(needle) || p.id.includes(needle) || (p.id === "custom" && /local|vllm|llama|tgi|litellm|self|own/.test(needle)));
    return (
      <div className={cx("dlg__panel frame", m.panel)}>
        <button type="button" className="btn btn--icon btn--sm btn--bare dlg__close" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        <h2 className={m.title} id="modelDlgTitle">Add a model</h2>
        <p className={m.sub}>Pick who runs it. Hosted providers run on our server with your key; a model on your computer or network runs from your browser.</p>
        <div className={m.search}>
          <label className="searchbox">
            <Icon name="search" />
            <input type="search" placeholder="Search providers" aria-label="Search providers" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          </label>
        </div>
        {GROUPS.map((g) => {
          const list = shown.filter((p) => p.group === g);
          if (!list.length) return null;
          return (
            <section className={m.group} key={g} aria-labelledby={`grp-${g}`}>
              <h3 id={`grp-${g}`}>{GROUP_LABEL[g]}</h3>
              <div className={m.tiles}>
                {list.map((p) => (
                  <button key={p.id} type="button" className={m.tile} data-provider={p.id} onClick={() => choose(p)}>
                    <b>{p.name}</b>
                    {p.runsIn === "server" ? (
                      <span><Icon name="server" />Runs on our server</span>
                    ) : p.runsIn === "browser" ? (
                      <span><Icon name="monitor" />Runs in your browser</span>
                    ) : (
                      <span><Icon name="code" />Any OpenAI-compatible URL</span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
        {!shown.length && <p className={m.none}>No provider matches. Custom (OpenAI-compatible) connects almost anything else.</p>}
      </div>
    );
  }

  /* ---- Screen 2: connect -------------------------------------------------------- */
  const where: RunsIn = def.runsIn === "either" ? runsIn : def.runsIn;
  const set = (k: string, v: string) => {
    setValues((x) => ({ ...x, [k]: v }));
    setConn({ kind: "idle" });
    setTest({ kind: "idle" });
    setError(null);
    if (k === "baseURL" && def.runsIn === "either" && !runsInTouched) setRunsIn(suggestRunsIn(def, v.trim()));
  };
  const enteredKey = values.apiKey?.trim() ?? "";

  function settingsOf(): Settings {
    const out: Record<string, unknown> = {};
    for (const f of def!.fields) if (!f.secret && values[f.key]?.trim()) out[f.key] = values[f.key]!.trim();
    if (def!.id === "custom") out.includeUsage = includeUsage;
    if (def!.protocol === "bedrock") out.authMode = values.apiKey?.trim() || (!replaceKey && source?.settings.authMode === "apiKey") ? "apiKey" : "accessKeys";
    if (where === "browser" && browserKey()) out.localKey = true;
    return out as Settings;
  }

  // Saved credentials only go where they were saved for.
  const moved = Boolean(source && hasStored && (where !== source.runsIn || destinationOf(def.id, settingsPreview()) !== destinationOf(source.provider, source.settings)));
  const replaceKey = replace || moved;

  function settingsPreview(): Settings {
    const out: Record<string, string> = {};
    for (const f of def!.fields) if (!f.secret && values[f.key]?.trim()) out[f.key] = values[f.key]!.trim();
    return out as Settings;
  }

  function browserKey(): string | undefined {
    return replaceKey ? enteredKey || undefined : storedLocal;
  }

  function secretOf(): Secret | null {
    if (!replaceKey || where === "browser") return null;
    const out: Record<string, unknown> = {};
    for (const f of def!.fields) if (f.secret && f.key !== "headers" && values[f.key]?.trim()) out[f.key] = values[f.key]!.trim();
    if (values.headers?.trim()) out.headers = parseHeaders(values.headers);
    return Object.keys(out).length ? (out as Secret) : null;
  }

  function draft(): DraftInput {
    return { provider: def!.id, runsIn: where, settings: settingsOf(), secret: secretOf(), from: !replaceKey && source?.hasSecret ? source.id : null };
  }

  /** The first thing wrong with the form, before asking anyone. */
  function problem(): string | null {
    try {
      new URL(values.baseURL?.trim() || "https://x");
    } catch {
      return "Enter a full address, like http://localhost:11434/v1.";
    }
    try {
      return draftProblem(def!, where, settingsOf(), secretOf(), hasStored && !replaceKey);
    } catch (e) {
      return (e as Error).message;
    }
  }

  async function connect(): Promise<Conn> {
    setError(null);
    const p = problem();
    if (p) {
      const c: Conn = { kind: "bad", message: p };
      setConn(c);
      return c;
    }
    setConn({ kind: "busy" });
    let c: Conn;
    if (where === "browser") {
      try {
        const r = await listModelsInBrowser(def!.id, def!.name, values.baseURL!.trim(), browserKey());
        setModels(r.models);
        c = { kind: "ok", ms: r.ms, count: r.models.length, checked: true };
      } catch (e) {
        c = e instanceof UnreachableError ? { kind: "bad", message: "Your browser could not reach the server.", unreachable: true } : { kind: "bad", message: (e as Error).message };
      }
    } else {
      const r = await probeModelsAction(draft()).catch(() => ({ ok: false as const, error: "Something went wrong on our side. Try again." }));
      if (r.ok) {
        if (r.models) setModels(r.models);
        c = { kind: "ok", ms: r.ms, count: r.models?.length ?? null, checked: r.keyChecked };
      } else c = { kind: "bad", message: r.error, refused: "refused" in r ? r.refused : false };
    }
    setConn(c);
    return c;
  }

  async function sendTest(): Promise<Test> {
    if (!modelId.trim()) {
      const t: Test = { kind: "bad", message: "Choose or type a model first." };
      setTest(t);
      return t;
    }
    setTest({ kind: "busy" });
    const r = await testMessageAction(draft(), modelId.trim()).catch(() => ({ ok: false as const, error: "Something went wrong on our side. Try again." }));
    const t: Test = r.ok ? { kind: "ok", ms: r.ms } : { kind: "bad", message: r.error };
    setTest(t);
    return t;
  }

  function chooseModel(id: string) {
    setModelId(id);
    latestModel.current = id;
    setTest({ kind: "idle" });
    setError(null);
    window.clearTimeout(priceTimer.current);
    const entry = models.find((x) => x.id === id);
    if (entry?.input !== undefined && entry.output !== undefined) return setPrice({ input: str(entry.input), output: str(entry.output), source: entry.source ?? "provider" });
    const listed = def!.prices?.[id];
    if (listed) return setPrice({ input: str(listed[0]), output: str(listed[1]), source: "catalog" });
    if (where === "browser") return setPrice({ input: "0", output: "0", source: "local" });
    setPrice({ input: "", output: "", source: null });
    if (!id.trim()) return;
    priceTimer.current = window.setTimeout(async () => {
      const hit = await suggestPriceAction(def!.id, where, id.trim()).catch(() => null);
      if (hit && latestModel.current === id) setPrice((p) => (p.source === "user" ? p : { input: str(hit.input), output: str(hit.output), source: hit.source }));
    }, 450);
  }

  async function save() {
    setError(null);
    if (!label.trim()) return setError({ message: "Give it a label.", field: "label" });
    if (!modelId.trim()) return setError({ message: "Choose or type a model.", field: "model" });
    const p = problem();
    if (p) return setError({ message: p });
    setSaving(true);
    try {
      // Check new credentials before keeping them. Unchanged ones were checked when saved.
      let check: { ok: boolean; ms: number | null; message: string | null } | null = null;
      const fresh = mode.kind !== "edit" || replaceKey || sameSettings(settingsPreview(), source!.settings) === false || modelId.trim() !== source!.modelId;
      if (fresh) {
        const c = conn.kind === "ok" || conn.kind === "bad" ? conn : await connect();
        if (where === "server" && c.kind === "bad") {
          const t = test.kind === "ok" ? test : c.refused ? null : def!.models === null || def!.id === "custom" ? await sendTest() : null;
          if (!t || t.kind !== "ok") return setError({ message: c.message, field: c.refused ? "secret" : undefined });
          check = { ok: true, ms: t.ms, message: null };
        } else if (c.kind === "ok") {
          check = { ok: true, ms: c.checked || where === "browser" ? c.ms : null, message: null };
          if (!c.checked && test.kind === "ok") check.ms = test.ms;
          if (!c.checked && test.kind !== "ok") check = null;
        } else if (c.kind === "bad") {
          check = { ok: false, ms: null, message: c.message };
        }
      }
      const r = await saveModelAction({
        id: mode.kind === "edit" ? source!.id : null,
        label: label.trim(),
        modelId: modelId.trim(),
        draft: draft(),
        keep: mode.kind === "edit" && !replaceKey && source!.hasSecret,
        price: { input: num(price.input), output: num(price.output), source: price.source },
        check,
      });
      if (!r.ok) return setError({ message: r.error, field: r.field });
      if (r.model.runsIn === "browser") setLocalSecret(userId, r.model.id, browserKey());
      onSaved(r.model, mode.kind);
    } catch (e) {
      setError({ message: (e as Error).message || "The model was not saved. Try again." });
    } finally {
      setSaving(false);
    }
  }

  const title = mode.kind === "add" ? `Connect ${def.name}` : mode.kind === "edit" ? `Edit ${source!.label}` : `Duplicate ${source!.label}`;
  const main = def.fields.filter((f) => !f.advanced && (where === "server" || f.key !== "headers"));
  const advanced = def.fields.filter((f) => f.advanced && (where === "server" || f.key !== "headers"));
  const secretFields = (fs: Field[]) => fs.filter((f) => f.secret);
  const firstSecret = main.find((f) => f.secret);
  const baseURL = values.baseURL?.trim() ?? "";
  const showWorks = where === "browser" && /^https?:\/\/\S+/.test(baseURL);
  const busy = conn.kind === "busy" || test.kind === "busy" || saving;
  const priceNote = PRICE_NOTE[price.source ?? "none"](def.name);

  const renderField = (f: Field) => {
    const id = `m-${f.key}`;
    const help = f.help ? `${id}-help` : undefined;
    const isSecretField = f.secret;
    const bad = error?.field === "secret" && isSecretField;
    return (
      <div className="field" key={f.key}>
        <div className={m.labelRow}>
          <label className="label" htmlFor={id}>{f.label}</label>
          {f === firstSecret && def.keyUrl && (
            <a href={def.keyUrl} target="_blank" rel="noopener noreferrer">Get a key<Icon name="external" /></a>
          )}
        </div>
        {f.key === "headers" ? (
          <textarea className="input" id={id} rows={3} spellCheck={false} placeholder={"X-Team: research\nX-Route: eu"} value={values.headers ?? ""} onChange={(e) => set("headers", e.target.value)} aria-describedby={help} />
        ) : (
          <input
            className={cx("input", (isSecretField || f.key === "baseURL" || f.key === "resourceName" || f.key === "region") && "input--mono")}
            id={id}
            type={isSecretField ? "password" : f.key === "baseURL" ? "url" : "text"}
            autoComplete="off"
            spellCheck={false}
            placeholder={f.placeholder}
            value={values[f.key] ?? ""}
            onChange={(e) => set(f.key, e.target.value)}
            aria-describedby={help}
            aria-invalid={bad || undefined}
            required={f.required}
          />
        )}
        {f.help && <p className={m.help} id={help}>{f.help}</p>}
      </div>
    );
  };

  return (
    <div className={cx("dlg__panel frame", m.panel)}>
      <button type="button" className="btn btn--icon btn--sm btn--bare dlg__close" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
      {mode.kind === "add" && (
        <button type="button" className={cx("btn btn--sm btn--bare", m.back)} onClick={() => setDef(null)}>
          <Icon name="back" />All providers
        </button>
      )}
      <h2 className={m.title} id="modelDlgTitle">{title}</h2>
      {def.note && <p className={m.sub}>{def.note}</p>}

      <form
        className={m.form}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="field">
          <label className="label" htmlFor="m-label">Label</label>
          <input className="input" id="m-label" maxLength={60} value={label} onChange={(e) => { setLabel(e.target.value); setError(null); }} aria-invalid={error?.field === "label" || undefined} aria-describedby="m-label-help" />
          <p className={m.help} id="m-label-help">How it shows in the run panel. Use a different label for each key or model, like “Work GPT”.</p>
        </div>

        {def.runsIn === "either" && (
          <div className="field">
            <span className="label" id="m-where">Where it runs</span>
            <div className="seg" role="group" aria-labelledby="m-where">
              <button type="button" aria-pressed={where === "server"} onClick={() => { setRunsIn("server"); setRunsInTouched(true); setConn({ kind: "idle" }); }}>On our server</button>
              <button type="button" aria-pressed={where === "browser"} onClick={() => { setRunsIn("browser"); setRunsInTouched(true); setConn({ kind: "idle" }); }}>In my browser</button>
            </div>
            <p className={m.help}>{where === "server" ? "For a public https:// endpoint. Our server calls it with your key, encrypted at rest." : "For a model on your computer or network. Your browser calls it directly; nothing passes through our server."}</p>
          </div>
        )}

        {main.filter((f) => !f.secret).map(renderField)}

        {secretFields(def.fields).length > 0 && !replaceKey ? (
          <div className="field">
            <span className="label">{firstSecret?.label ?? "Credentials"}</span>
            <div className={m.saved}>
              <span>
                <Icon name="lock" />
                {where === "browser"
                  ? "Key saved in this browser."
                  : mode.kind === "duplicate"
                    ? `Copied from ${source!.label}${source!.secretHint ? ` · ends ${source!.secretHint}` : ""}`
                    : `Saved key${source!.secretHint ? ` ending ${source!.secretHint}` : ""}`}
              </span>
              <button type="button" className="btn btn--sm" onClick={() => { setReplace(true); setConn({ kind: "idle" }); }}>Replace key</button>
            </div>
          </div>
        ) : (
          <>
            {moved && <p className={m.help} role="status">The address or where it runs changed, so the saved key cannot go with it. Paste the key again.</p>}
            {main.filter((f) => f.secret).map(renderField)}
          </>
        )}

        {showWorks && <WorksIn baseURL={baseURL} />}

        {(advanced.length > 0 || def.id === "custom") && (
          <details className={m.more}>
            <summary>More options</summary>
            <div>
              {advanced.filter((f) => !f.secret || replaceKey).map(renderField)}
              {def.id === "custom" && (
                <label className={m.check}>
                  <input type="checkbox" checked={includeUsage} onChange={(e) => setIncludeUsage(e.target.checked)} />
                  <span>Ask the server to report token usage while streaming. Turn this off if runs fail with a 400 error.</span>
                </label>
              )}
            </div>
          </details>
        )}

        {(def.models || where === "browser") && (
        <div className={m.connect}>
          <button type="button" className={cx("btn", conn.kind === "busy" && "is-busy")} onClick={() => void connect()} disabled={busy}>
            <span className="btn-spin" aria-hidden="true" />
            {conn.kind === "ok" ? "Load models again" : "Connect and load models"}
          </button>
          <p className={m.status} role="status" data-tone={conn.kind === "ok" ? "ok" : conn.kind === "bad" ? "bad" : undefined}>
            {conn.kind === "busy" && (where === "browser" ? "Asking your server from this browser" : `Asking ${def.name}`)}
            {conn.kind === "ok" && (
              <>
                <Icon name="check" size="sm" />
                {conn.count === null ? "Connected." : `Connected · ${conn.ms} ms · ${conn.count} ${conn.count === 1 ? "model" : "models"}`}
              </>
            )}
            {conn.kind === "bad" && <>✕ {conn.message}</>}
          </p>
        </div>
        )}
        {conn.kind === "bad" && !def.models && where === "server" && <p className={m.fieldErr} role="alert">{conn.message}</p>}
        {conn.kind === "bad" && conn.unreachable && <Troubleshoot provider={def.id} baseURL={baseURL} />}

        <div className="field">
          <label className="label" htmlFor="m-model">Model</label>
          <ModelPicker id="m-model" models={models} value={modelId} onChange={chooseModel} placeholder={def.modelPlaceholder} invalid={error?.field === "model"} describedBy="m-model-help" />
          <p className={m.help} id="m-model-help">
            {models.length
              ? `Pick from ${models.length === 1 ? "the list" : `${models.length} models`}, or type any model ID.`
              : def.models || where === "browser"
                ? "Connect to load the list, or type the model ID."
                : `${def.name} has no model list to load. Type the model ID, then send a test message.`}
          </p>
        </div>

        {where === "server" && (def.models === null || def.id === "custom" || test.kind !== "idle") && (
          <div className={m.connect}>
            <button type="button" className={cx("btn btn--sm", test.kind === "busy" && "is-busy")} onClick={() => void sendTest()} disabled={busy}>
              <span className="btn-spin" aria-hidden="true" />
              Send a test message
            </button>
            <p className={m.status} role="status" data-tone={test.kind === "ok" ? "ok" : test.kind === "bad" ? "bad" : undefined}>
              {test.kind === "idle" && "Uses a few tokens on your account."}
              {test.kind === "busy" && "Sending"}
              {test.kind === "ok" && <><Icon name="check" size="sm" />The model answered · {test.ms} ms</>}
              {test.kind === "bad" && <>✕ {test.message}</>}
            </p>
          </div>
        )}

        <div className={m.prices} role="group" aria-labelledby="m-price">
          <span className="label" id="m-price" style={{ gridColumn: "1 / -1" }}>Price per 1M tokens · for the cost shown after a run</span>
          <div className="field">
            <label className="label" htmlFor="m-in">Input</label>
            <div className={m.money}><input className="input input--mono" id="m-in" inputMode="decimal" placeholder="—" value={price.input} onChange={(e) => setPrice((p) => ({ ...p, input: e.target.value, source: "user" }))} /></div>
          </div>
          <div className="field">
            <label className="label" htmlFor="m-out">Output</label>
            <div className={m.money}><input className="input input--mono" id="m-out" inputMode="decimal" placeholder="—" value={price.output} onChange={(e) => setPrice((p) => ({ ...p, output: e.target.value, source: "user" }))} /></div>
          </div>
          <p className={m.help}>{priceNote}</p>
        </div>

        {error && <p className={m.formErr} role="alert">{error.message}</p>}

        <p className={m.help}>
          <Icon name="lock" size="sm" />{" "}
          {where === "server"
            ? `Keys are encrypted at rest, sent only to ${def.name}, never shown again and never logged.`
            : "Your browser talks to this model directly. Its address is saved to your account; its key stays in this browser."}
        </p>

        <div className={m.actions}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className={cx("btn btn--primary", saving && "is-busy")} disabled={busy}>
            <span className="btn-spin" aria-hidden="true" />
            {mode.kind === "edit" ? "Save changes" : "Save model"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Whether the text settings (address, resource, region…) are unchanged. */
function sameSettings(a: Settings, b: Settings): boolean {
  const text = (x: Settings) =>
    JSON.stringify(
      Object.entries(x)
        .filter(([, v]) => typeof v === "string")
        .sort(([k1], [k2]) => k1.localeCompare(k2)),
    );
  return text(a) === text(b);
}
