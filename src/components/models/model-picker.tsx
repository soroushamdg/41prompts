"use client";
import { useId, useMemo, useRef, useState } from "react";
import { formatPrice } from "@/lib/catalog";
import type { ModelEntry } from "@/lib/model-list";
import s from "./models.module.css";

type Props = {
  id: string;
  models: ModelEntry[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  invalid?: boolean;
  describedBy?: string;
};

const SHOWN = 120;

/** A model ID input with a searchable list of the provider's models. Any ID can be typed. */
export function ModelPicker({ id, models, value, onChange, placeholder, invalid, describedBy }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [query, setQuery] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const needle = (query ?? "").trim().toLowerCase();
  const matches = useMemo(() => (needle ? models.filter((m) => m.id.toLowerCase().includes(needle) || m.name?.toLowerCase().includes(needle)) : models), [models, needle]);
  const shown = matches.slice(0, SHOWN);
  const expanded = open && models.length > 0;

  function pick(m: ModelEntry) {
    onChange(m.id);
    setQuery(null);
    setOpen(false);
    setActive(-1);
  }

  function move(delta: number) {
    if (!shown.length) return;
    setOpen(true);
    const next = (active + delta + shown.length) % shown.length;
    setActive(next);
    listRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
  }

  return (
    <div className={s.picker}>
      <input
        className="input input--mono"
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setQuery(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            move(1);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            move(-1);
          } else if (e.key === "Enter" && expanded && active >= 0 && shown[active]) {
            e.preventDefault();
            pick(shown[active]);
          } else if (e.key === "Escape" && expanded) {
            // Close the list, not the dialog around it.
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {expanded && (
        <ul className={s.list} id={listId} role="listbox" ref={listRef} aria-label="Models">
          {shown.map((m, i) => (
            <li
              key={m.id}
              id={`${listId}-${i}`}
              className={s.opt}
              role="option"
              aria-selected={i === active || (active < 0 && m.id === value)}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(m);
              }}
            >
              <span>
                <b>{m.id}</b>
                {m.name && <em>{m.name}</em>}
              </span>
              {m.input !== undefined && m.output !== undefined && <small>{formatPrice({ input: m.input, output: m.output })}</small>}
            </li>
          ))}
          {!shown.length && <li className={s.listNote} role="presentation">No match in the list. The ID you typed is used as it is.</li>}
          {matches.length > SHOWN && <li className={s.listNote} role="presentation">{matches.length - SHOWN} more. Keep typing to narrow the list.</li>}
        </ul>
      )}
    </div>
  );
}
