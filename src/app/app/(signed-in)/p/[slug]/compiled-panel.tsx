"use client";
import { forwardRef, useState } from "react";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { track } from "@/lib/analytics";
import { type Compiled, countLabel } from "@/lib/compile";
import { cx } from "@/lib/cx";
import s from "./editor.module.css";

type Props = {
  compiled: Compiled;
  mode: "template" | "filled";
  setMode: (m: "template" | "filled") => void;
  values: Record<string, string>;
  setValue: (name: string, value: string) => void;
  copyMarkdown: () => string;
  copyJson: () => string;
};

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Compiled (M04): the prompt you ship, rebuilt live, copied in one click. */
export const CompiledPanel = forwardRef<HTMLDivElement, Props>(function CompiledPanel({ compiled, mode, setMode, values, setValue, copyMarkdown, copyJson }, ref) {
  const toast = useToast();
  const [done, setDone] = useState(0);

  async function copyPrompt() {
    const ok = await writeClipboard(compiled.text);
    if (!ok) return toast("Copy did not work in this browser. Select the text and copy it instead.", { tone: "bad" });
    track("prompt_copied", { format: "text", mode });
    const n = Date.now();
    setDone(n);
    setTimeout(() => setDone((d) => (d === n ? 0 : d)), 1800);
  }

  async function copyAs(fmt: "md" | "json") {
    const ok = await writeClipboard(fmt === "md" ? copyMarkdown() : copyJson());
    if (!ok) return toast("Copy did not work in this browser.", { tone: "bad" });
    track("prompt_copied", { format: fmt });
    toast(fmt === "md" ? "Copied as Markdown." : "Copied as JSON.");
  }

  return (
    <>
      <div className={s.sideRow}>
        <div className="seg" role="group" aria-label="Show variables as">
          <button type="button" aria-pressed={mode === "template"} onClick={() => setMode("template")}>Template</button>
          <button type="button" aria-pressed={mode === "filled"} onClick={() => setMode("filled")}>Filled</button>
        </div>
        <span className="mono muted" style={{ fontSize: 11 }}>{countLabel(compiled)}</span>
      </div>
      <div className={s.compiled} ref={ref} aria-label="Compiled prompt" tabIndex={0}>
        {compiled.segments.length === 0 ? (
          <div className={s.compiledEmpty}>Nothing to compile yet. Bloks you write show up here, except expects bloks.</div>
        ) : (
          compiled.segments.map((seg) => (
            <div key={seg.id} className={s.cseg} data-type={seg.type} data-for={seg.id}>
              <span className={s.csegId}>{seg.id}</span>
              <span className={s.csegText}>
                {seg.parts.map((part, i) =>
                  part.variable ? (
                    <span key={`${seg.id}-${i}-${mode}`} className={s.cvar} data-filled={part.filled ? "" : undefined}>{part.text}</span>
                  ) : (
                    part.text
                  ),
                )}
              </span>
            </div>
          ))
        )}
      </div>
      {compiled.variables.map((v) => (
        <div className="field" key={v}>
          <label className="label" htmlFor={`var-${v}`}>Variable · {v}</label>
          <input className="input" id={`var-${v}`} type="text" autoComplete="off" value={values[v] ?? ""} placeholder={`Value for {{${v}}}`} onChange={(e) => setValue(v, e.target.value)} />
        </div>
      ))}
      <button className={cx("btn btn--primary btn--lg btn--block", s.copy)} type="button" onClick={copyPrompt} data-done={done ? "" : undefined} disabled={!compiled.text}>
        <Icon name="copy" className={s.idle} />
        <Icon name="check" className={s.done} />
        <span>{done ? "Copied" : "Copy prompt"}</span>
      </button>
      <div className={s.copyRow}>
        <button className="btn btn--sm" type="button" onClick={() => copyAs("md")}>Copy as Markdown</button>
        <button className="btn btn--sm" type="button" onClick={() => copyAs("json")}>Copy as JSON</button>
      </div>
      <p className={s.note}>Expects bloks stay out of the prompt. With Performance they become tests you can run on every model.</p>
    </>
  );
});
