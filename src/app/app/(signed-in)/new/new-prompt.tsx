"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { TabList, TabPanel } from "@/components/tabs";
import { useUpgrade } from "@/components/upgrade/upgrade";
import { track } from "@/lib/analytics";
import { BLOK_HINT, BLOK_LABEL, BLOK_TYPES, MAX_PROMPT_CHARS, type BlokType } from "@/lib/bloks";
import { cx } from "@/lib/cx";
import { slugify } from "@/lib/slug";
import { findVariables } from "@/lib/variables";
import { createPromptAction } from "@/server/actions/prompts";
import s from "./new.module.css";

type Mode = "paste" | "blank";

export function NewPrompt() {
  const router = useRouter();
  const { open } = useUpgrade();
  const [mode, setMode] = useState<Mode>("paste");
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [type, setType] = useState<BlokType>("context");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const radios = useRef<Array<HTMLButtonElement | null>>([]);

  const vars = findVariables(text);
  const lines = text ? text.split("\n").length : 0;
  const tooLong = text.length > MAX_PROMPT_CHARS;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy || tooLong) return;
    setBusy(true);
    setError(null);
    const res = await createPromptAction(mode === "paste" ? { mode, name, text } : { mode, name, type });
    if (!res.ok) {
      setBusy(false);
      setError(res.error);
      return;
    }
    track("prompt_created", { mode, chars: mode === "paste" ? text.length : 0, variables: vars.length });
    router.push(`/p/${res.slug}`);
  }

  function radioKey(e: React.KeyboardEvent, i: number) {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const n = (i + dir + BLOK_TYPES.length) % BLOK_TYPES.length;
    setType(BLOK_TYPES[n]!);
    radios.current[n]?.focus();
  }

  return (
    <>
      <TabList
        idPrefix="np"
        label="How to start"
        variant="seg"
        className={s.start}
        value={mode}
        onChange={setMode}
        items={[{ id: "paste", label: "Paste a prompt" }, { id: "blank", label: "Start blank" }]}
      />

      <form className={cx("frame", s.card)} id="npForm" onSubmit={create} noValidate>
        <div className="field">
          <label className="label" htmlFor="npName">Name</label>
          <input
            className="input input--mono"
            id="npName"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder={mode === "paste" && text.trim() ? "named from the first words" : "untitled-prompt"}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && setName(slugify(name))}
          />
        </div>

        <TabPanel idPrefix="np" id="paste" active={mode === "paste"} className={s.panel}>
          <div className="field">
            <label className="label" htmlFor="npText">Your prompt</label>
            <textarea
              className="input"
              id="npText"
              rows={11}
              spellCheck={false}
              placeholder="Paste any prompt. Markdown and variables in double braces are kept."
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-describedby="npStats"
            />
          </div>
          <div className={s.stats}>
            <span className={s.count} id="npStats">
              {text.length.toLocaleString("en-US")} characters · {lines} {lines === 1 ? "line" : "lines"} · Markdown kept
            </span>
            <span className="label">Variables found</span>
            <span className={s.vars} aria-live="polite">
              {/* Keyed by name, so only chips that are new since the last keystroke pop in. */}
              {vars.length ? vars.map((v) => <span key={v} className="var">{`{{${v}}}`}</span>) : <span className="muted">None</span>}
            </span>
          </div>
          {tooLong && <p className={s.err} role="alert">That is more than about 100 KB. Trim it a little and try again.</p>}
          <div className={s.split}>
            <input id="npSplit" type="checkbox" disabled />
            <div className={s.splitText}>
              <div className={s.splitHead}>
                <label htmlFor="npSplit">Split into bloks automatically</label>
                <button className="stamp" type="button" data-perf="The decompiler" onClick={() => open("The decompiler")}>Performance</button>
              </div>
              <span>On Free your paste becomes one context blok. Split it by hand in the editor, or let the decompiler type every part with Performance.</span>
            </div>
          </div>
        </TabPanel>

        <TabPanel idPrefix="np" id="blank" active={mode === "blank"}>
          <div className="field">
            <span className="label" id="firstLbl">Pick the first blok</span>
            <div className={s.types} role="radiogroup" aria-labelledby="firstLbl">
              {BLOK_TYPES.map((t, i) => (
                <button
                  key={t}
                  ref={(el) => {
                    radios.current[i] = el;
                  }}
                  className={s.type}
                  type="button"
                  role="radio"
                  aria-checked={type === t}
                  tabIndex={type === t ? 0 : -1}
                  data-type={t}
                  onClick={() => setType(t)}
                  onKeyDown={(e) => radioKey(e, i)}
                >
                  <b>{BLOK_LABEL[t]}</b>
                  <span>{BLOK_HINT[t]}</span>
                </button>
              ))}
            </div>
          </div>
        </TabPanel>
        {error && <p className={s.err} role="alert">{error}</p>}
      </form>

      <div className={s.actions}>
        <Link className="btn btn--lg" href="/">Cancel</Link>
        <button className={cx("btn btn--primary btn--lg btn--go", busy && "is-busy")} type="submit" form="npForm" disabled={busy || tooLong}>
          <span className="btn-spin" aria-hidden="true" />
          <span>{busy ? "Creating" : mode === "paste" ? "Create prompt" : "Create blank prompt"}</span>
          <Icon name="arrow-right" />
        </button>
      </div>
    </>
  );
}
