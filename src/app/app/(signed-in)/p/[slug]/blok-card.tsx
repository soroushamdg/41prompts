"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { PerfButton } from "@/components/upgrade/upgrade";
import { BLOK_HINT, BLOK_LABEL, BLOK_TYPES, type Blok, type BlokType } from "@/lib/bloks";
import { cx } from "@/lib/cx";
import { splitVariables } from "@/lib/variables";
import { caretOffset, paintText, readText } from "./blok-text";
import s from "./editor.module.css";

type Props = {
  blok: Blok;
  readOnly?: boolean;
  fresh?: boolean;
  lifted?: boolean;
  enterDelay?: number;
  onText?: (id: string, text: string) => void;
  onType?: (id: string, type: BlokType) => void;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
  onSplit?: (id: string, offset: number | null) => void;
  onCaret?: (id: string, offset: number) => void;
  onGripDown?: (e: React.PointerEvent) => void;
  onGripKey?: (id: string, dir: -1 | 1) => void;
};

/** One blok (docs/DESIGN.md §6): grip, type, ID, tools, editable text. */
export function BlokCard(p: Props) {
  const { blok, readOnly } = p;
  const text = useRef<HTMLParagraphElement>(null);
  const [menu, setMenu] = useState(false);

  // Repaint only when the text changed from outside, or when not focused.
  useLayoutEffect(() => {
    const el = text.current;
    if (!el || readOnly) return;
    if (readText(el) !== blok.text) paintText(el, blok.text);
  }, [blok.text, readOnly]);

  const label = BLOK_LABEL[blok.type];
  return (
    <section
      className={cx("blok frame", p.fresh && "is-new", p.lifted && "is-lifted")}
      data-type={blok.type}
      data-id={blok.id}
      aria-label={`${label} blok ${blok.id}`}
      style={p.enterDelay !== undefined ? { animation: `blok-in 640ms var(--ease-brand) ${p.enterDelay}ms both` } : undefined}
    >
      {!readOnly && (
        <button
          className="grip"
          type="button"
          data-grip={blok.id}
          aria-label={`Move blok ${blok.id}. Drag, or press the up and down arrow keys.`}
          onPointerDown={p.onGripDown}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              p.onGripKey?.(blok.id, e.key === "ArrowUp" ? -1 : 1);
            }
          }}
        >
          <Icon name="grip" />
        </button>
      )}
      <div className="blok__main">
        <div className="blok__head">
          {readOnly ? (
            <span className="blok__type">{label}</span>
          ) : (
            <TypeMenu id={blok.id} type={blok.type} open={menu} setOpen={setMenu} onPick={(t) => p.onType?.(blok.id, t)} />
          )}
          <span className="blok__id">{blok.id}</span>
          {!readOnly && (
            <span className="blok__tools">
              <button
                className="btn btn--icon btn--sm btn--bare"
                type="button"
                aria-label={`Split blok ${blok.id} at the cursor`}
                title="Split here (Ctrl+Shift+Enter)"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => p.onSplit?.(blok.id, text.current && document.activeElement === text.current ? caretOffset(text.current) : null)}
              >
                <Icon name="split" />
              </button>
              <button className="btn btn--icon btn--sm btn--bare" type="button" aria-label={`Duplicate blok ${blok.id}`} title="Duplicate" onClick={() => p.onDuplicate?.(blok.id)}>
                <Icon name="copy" />
              </button>
              <button className="btn btn--icon btn--sm btn--bare" type="button" aria-label={`Delete blok ${blok.id}`} title="Delete" onClick={() => p.onDelete?.(blok.id)}>
                <Icon name="trash" />
              </button>
            </span>
          )}
        </div>
        {readOnly ? (
          <p className="blok__text">
            {splitVariables(blok.text).map((part, i) => (part.variable ? <span key={i} className="var">{part.text}</span> : part.text))}
          </p>
        ) : (
          <p
            ref={text}
            className="blok__text"
            contentEditable="plaintext-only"
            suppressContentEditableWarning
            spellCheck={false}
            role="textbox"
            aria-multiline="true"
            aria-label={`Text of blok ${blok.id}`}
            data-placeholder={BLOK_HINT[blok.type]}
            onInput={(e) => {
              if ((e.nativeEvent as InputEvent).isComposing) return;
              p.onText?.(blok.id, readText(e.currentTarget));
            }}
            onCompositionEnd={(e) => p.onText?.(blok.id, readText(e.currentTarget))}
            onKeyUp={(e) => {
              const o = caretOffset(e.currentTarget);
              if (o !== null) p.onCaret?.(blok.id, o);
            }}
            onMouseUp={(e) => {
              const o = caretOffset(e.currentTarget);
              if (o !== null) p.onCaret?.(blok.id, o);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.shiftKey && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                p.onSplit?.(blok.id, caretOffset(e.currentTarget));
              }
            }}
            onBlur={(e) => paintText(e.currentTarget, readText(e.currentTarget))}
          />
        )}
        {blok.type === "expects" && (
          <div className="blok__foot">
            <span className="blok__note">Becomes a test · not in the prompt</span>
            {!readOnly && (
              <PerfButton feature="Tests" className="btn--sm blok__runtest">
                Run as test <span className="stamp">Performance</span>
              </PerfButton>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function TypeMenu({ id, type, open, setOpen, onPick }: { id: string; type: BlokType; open: boolean; setOpen: (v: boolean) => void; onPick: (t: BlokType) => void }) {
  const wrap = useRef<HTMLSpanElement>(null);
  const items = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => {
    if (!open) return;
    items.current[BLOK_TYPES.indexOf(type)]?.focus();
    const away = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open, type, setOpen]);
  return (
    <span className={s.typeWrap} ref={wrap}>
      <button
        type="button"
        className={cx("blok__type", s.typeBtn)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${BLOK_LABEL[type]}. Change the type of blok ${id}`}
        onClick={() => setOpen(!open)}
      >
        {BLOK_LABEL[type]}
      </button>
      {open && (
        <span
          className={cx("frame", s.typeMenu)}
          role="menu"
          aria-label={`Type of blok ${id}`}
          onKeyDown={(e) => {
            const i = items.current.findIndex((b) => b === document.activeElement);
            if (e.key === "Escape") {
              setOpen(false);
              wrap.current?.querySelector("button")?.focus();
            } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const n = (i + (e.key === "ArrowDown" ? 1 : -1) + BLOK_TYPES.length) % BLOK_TYPES.length;
              items.current[n]?.focus();
            }
          }}
        >
          {BLOK_TYPES.map((t, i) => (
            <button
              key={t}
              ref={(el) => {
                items.current[i] = el;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={t === type}
              data-type={t}
              onClick={() => {
                setOpen(false);
                if (t !== type) onPick(t);
              }}
            >
              {BLOK_LABEL[t]}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
