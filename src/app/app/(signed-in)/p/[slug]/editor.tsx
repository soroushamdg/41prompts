"use client";
import { AnimatePresence, Reorder, useDragControls } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { EASE_BRAND } from "@/components/motion-provider";
import { SearchHotkey } from "@/components/search-hotkey";
import { TabList, TabPanel } from "@/components/tabs";
import { useToast } from "@/components/toast";
import { PerfButton } from "@/components/upgrade/upgrade";
import { BLOK_LABEL, BLOK_TYPES, type Blok, type BlokType } from "@/lib/bloks";
import { compile, toJson, toMarkdown } from "@/lib/compile";
import { cx } from "@/lib/cx";
import { slugify } from "@/lib/slug";
import { relativeTime } from "@/lib/time";
import { getVersionAction, nameVersionAction, restoreVersionAction, saveFillValuesAction } from "@/server/actions/editor";
import { renamePromptAction } from "@/server/actions/prompts";
import type { KeySummary } from "@/server/keys";
import type { LibraryItem } from "@/server/prompts";
import type { SaveResult, VersionMeta } from "@/server/versions";
import { BlokCard } from "./blok-card";
import { placeCaret } from "./blok-text";
import { CompiledPanel } from "./compiled-panel";
import { HistoryPanel } from "./history-panel";
import s from "./editor.module.css";
import { Rail } from "./rail";
import { RunPanel } from "./run-panel";
import { clearDraft, type Draft, readDraft, useAutosave } from "./use-autosave";

export type EditorProps = {
  userId: string;
  prompt: { id: string; slug: string; sheetNumber: number; nextBlokId: number; fillValues: Record<string, string> };
  bloks: Blok[];
  versions: VersionMeta[];
  rail: LibraryItem[];
  keys: KeySummary[];
  keysLabel: string;
};

type Tab = "compiled" | "run" | "history";
const same = (a: Blok[], b: Blok[]) => JSON.stringify(a) === JSON.stringify(b);

export function Editor(props: EditorProps) {
  const { userId, prompt } = props;
  const router = useRouter();
  const toast = useToast();

  const [bloks, setBloks] = useState<Blok[]>(props.bloks);
  const bloksRef = useRef(bloks);
  const nextId = useRef(prompt.nextBlokId);
  const [versions, setVersions] = useState(props.versions);
  const [slug, setSlug] = useState(prompt.slug);
  const [rail, setRail] = useState(props.rail);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const [lifted, setLifted] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ number: number; bloks: Blok[] } | null>(null);
  const [mode, setMode] = useState<"template" | "filled">("template");
  const [values, setValues] = useState(prompt.fillValues);
  const [tab, setTab] = useState<Tab>("compiled");
  const [live, setLive] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [settled, setSettled] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const compiledRef = useRef<HTMLDivElement>(null);
  const focusGrip = useRef<string | null>(null);
  const focusText = useRef<{ id: string; at: "start" | "end" } | null>(null);
  const caret = useRef<Record<string, number>>({});
  const dragStart = useRef<string>("");
  const fillTimer = useRef<number>(0);
  const head = versions[0]?.number ?? 0;

  const touchRail = useCallback(
    (patch: Partial<LibraryItem>) =>
      setRail((items) => items.map((p) => (p.id === prompt.id ? { ...p, ...patch } : p)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))),
    [prompt.id],
  );

  const onSaved = useCallback(
    (r: SaveResult) => {
      if (r.created) {
        setVersions((vs) => [r.version, ...vs.filter((v) => v.number !== r.version.number)]);
        touchRail({ versions: r.version.number, updatedAt: r.version.createdAt, bloksCount: bloksRef.current.length });
      }
      if (r.conflict) toast("This prompt changed in another tab. Both versions are kept in History.");
    },
    [toast, touchRail],
  );
  const autosave = useAutosave({
    userId,
    promptId: prompt.id,
    initialHead: props.versions[0]?.number ?? 0,
    onSaved,
    onSignedOut: () => toast("Your session ended. Sign in again; your changes are kept on this device.", { tone: "bad", ms: 8000 }),
  });

  // ---- First paint: cascade in, and offer back any unsaved local draft ------
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), 1200);
    const d = readDraft(userId, prompt.id);
    if (d && !same(d.bloks, props.bloks)) queueMicrotask(() => setDraft(d));
    else if (d) clearDraft(userId, prompt.id);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- One door for every change: state, autosave, local draft --------------
  const commit = useCallback(
    (next: Blok[]) => {
      bloksRef.current = next;
      setBloks(next);
      autosave.change(next);
    },
    [autosave],
  );
  const say = (msg: string) => setLive(msg);
  const markFresh = (id: string) => {
    setFresh((f) => new Set(f).add(id));
    setTimeout(() => setFresh((f) => { const n = new Set(f); n.delete(id); return n; }), 700);
  };
  const flash = (id: string) => {
    requestAnimationFrame(() => {
      const c = compiledRef.current?.querySelector<HTMLElement>(`[data-for="${id}"]`);
      if (!c) return;
      c.removeAttribute("data-flash");
      void c.offsetWidth;
      c.setAttribute("data-flash", "");
    });
  };
  const newId = () => `B${nextId.current++}`;

  useLayoutEffect(() => {
    if (focusGrip.current) {
      listRef.current?.querySelector<HTMLElement>(`[data-grip="${focusGrip.current}"]`)?.focus();
      focusGrip.current = null;
    }
    if (focusText.current) {
      const { id, at } = focusText.current;
      const el = listRef.current?.querySelector<HTMLElement>(`.blok[data-id="${id}"] .blok__text`);
      if (el) {
        el.focus();
        placeCaret(el, at === "start" ? 0 : el.innerText.length);
        el.closest(".blok")?.scrollIntoView({ block: "nearest", behavior: document.documentElement.classList.contains("reduce") ? "auto" : "smooth" });
      }
      focusText.current = null;
    }
  });

  // ---- Bloks ----------------------------------------------------------------
  const onText = useCallback((id: string, text: string) => commit(bloksRef.current.map((b) => (b.id === id ? { ...b, text } : b))), [commit]);

  function add(type: BlokType) {
    const b: Blok = { id: newId(), type, text: "" };
    commit([...bloksRef.current, b]);
    markFresh(b.id);
    focusText.current = { id: b.id, at: "start" };
    say(`${BLOK_LABEL[type]} blok added.`);
  }

  function duplicate(id: string) {
    const all = bloksRef.current;
    const i = all.findIndex((b) => b.id === id);
    const copy: Blok = { ...all[i]!, id: newId() };
    commit([...all.slice(0, i + 1), copy, ...all.slice(i + 1)]);
    markFresh(copy.id);
    flash(copy.id);
    say(`Blok duplicated as ${copy.id}.`);
  }

  function remove(id: string) {
    const all = bloksRef.current;
    const i = all.findIndex((b) => b.id === id);
    const gone = all[i]!;
    commit(all.filter((b) => b.id !== id));
    say(`Blok ${id} deleted.`);
    toast(`Deleted blok ${id}.`, {
      action: "Undo",
      ms: 6000,
      onAction: () => {
        if (bloksRef.current.some((b) => b.id === id)) return;
        const now = bloksRef.current;
        const at = Math.min(i, now.length);
        commit([...now.slice(0, at), gone, ...now.slice(at)]);
        markFresh(id);
        flash(id);
        say(`Blok ${id} restored.`);
      },
    });
  }

  function retype(id: string, type: BlokType) {
    commit(bloksRef.current.map((b) => (b.id === id ? { ...b, type } : b)));
    flash(id);
    say(`Blok ${id} is now ${BLOK_LABEL[type].toLowerCase()}.`);
  }

  function split(id: string, at: number | null) {
    const all = bloksRef.current;
    const i = all.findIndex((b) => b.id === id);
    const b = all[i]!;
    // Split at the cursor; with the cursor at either end (or no cursor yet),
    // split at the first blank line, which is how pasted prompts are shaped.
    const cut = (o: number) => [b.text.slice(0, o).replace(/\s+$/, ""), b.text.slice(o).replace(/^\s+/, "")] as const;
    let [before, after] = cut(at ?? caret.current[id] ?? 0);
    if (!before || !after) {
      const para = b.text.search(/\n\s*\n/);
      if (para > 0) [before, after] = cut(para);
    }
    if (!before || !after) {
      toast("Put the cursor where the blok should split, then use Split here.");
      return;
    }
    const nb: Blok = { id: newId(), type: b.type, text: after };
    commit([...all.slice(0, i), { ...b, text: before }, nb, ...all.slice(i + 1)]);
    markFresh(nb.id);
    flash(nb.id);
    focusText.current = { id: nb.id, at: "start" };
    say(`Blok ${id} split. The second part is ${nb.id}.`);
  }

  function move(id: string, dir: -1 | 1) {
    const all = [...bloksRef.current];
    const i = all.findIndex((b) => b.id === id);
    const j = i + dir;
    if (j < 0 || j >= all.length) return;
    [all[i], all[j]] = [all[j]!, all[i]!];
    focusGrip.current = id;
    commit(all);
    flash(id);
    say(`Blok ${id} moved to position ${j + 1} of ${all.length}.`);
  }

  const onReorder = (ids: string[]) => {
    const byId = new Map(bloksRef.current.map((b) => [b.id, b]));
    const next = ids.map((x) => byId.get(x)!).filter(Boolean);
    bloksRef.current = next;
    setBloks(next);
  };
  const dragEnd = (id: string) => {
    setLifted(null);
    const order = bloksRef.current.map((b) => b.id).join();
    if (order !== dragStart.current) {
      autosave.change(bloksRef.current);
      flash(id);
      say(`Blok ${id} moved to position ${bloksRef.current.findIndex((b) => b.id === id) + 1}.`);
    }
  };

  // ---- Hover sync: blok ↔ compiled span (DOM classes, not React state) ------
  useEffect(() => {
    const list = listRef.current;
    const comp = compiledRef.current;
    if (!list || !comp) return;
    let hot: string | null = null;
    const toggle = (id: string, on: boolean) => {
      list.querySelector(`.blok[data-id="${id}"]`)?.classList.toggle("is-hot", on);
      const c = comp.querySelector<HTMLElement>(`[data-for="${id}"]`);
      if (!c) return;
      c.classList.toggle("is-hot", on);
      if (on) {
        const top = c.offsetTop - 8, bottom = c.offsetTop + c.offsetHeight + 8;
        if (top < comp.scrollTop || bottom > comp.scrollTop + comp.clientHeight) comp.scrollTo({ top, behavior: document.documentElement.classList.contains("reduce") ? "auto" : "smooth" });
      }
    };
    const set = (id: string | null) => {
      if (hot === id) return;
      if (hot) toggle(hot, false);
      hot = id;
      if (id) toggle(id, true);
    };
    const overList = (e: Event) => set((e.target as HTMLElement).closest<HTMLElement>(".blok")?.dataset.id ?? null);
    const overComp = (e: Event) => set((e.target as HTMLElement).closest<HTMLElement>("[data-for]")?.dataset.for ?? null);
    const leave = () => set(null);
    const focusIn = (e: Event) => {
      const t = e.target as HTMLElement;
      if (t.classList.contains("blok__text")) set(t.closest<HTMLElement>(".blok")?.dataset.id ?? null);
    };
    list.addEventListener("mouseover", overList);
    list.addEventListener("mouseleave", leave);
    list.addEventListener("focusin", focusIn);
    list.addEventListener("focusout", leave);
    comp.addEventListener("mouseover", overComp);
    comp.addEventListener("mouseleave", leave);
    return () => {
      list.removeEventListener("mouseover", overList);
      list.removeEventListener("mouseleave", leave);
      list.removeEventListener("focusin", focusIn);
      list.removeEventListener("focusout", leave);
      comp.removeEventListener("mouseover", overComp);
      comp.removeEventListener("mouseleave", leave);
    };
  }, [viewing]);

  // ---- Compiled -------------------------------------------------------------
  const source = viewing ? viewing.bloks : bloks;
  const deferred = useDeferredValue(source);
  const compiled = useMemo(() => compile(deferred, mode, values), [deferred, mode, values]);
  const variables = useMemo(() => compile(source).variables, [source]);
  const runSystem = useMemo(() => compile(bloks, "filled", values).text, [bloks, values]);

  function setValue(name: string, value: string) {
    setValues((v) => {
      const next = { ...v, [name]: value };
      window.clearTimeout(fillTimer.current);
      fillTimer.current = window.setTimeout(() => void saveFillValuesAction(prompt.id, next), 800);
      return next;
    });
  }

  // ---- History --------------------------------------------------------------
  async function open(n: number) {
    const b = await getVersionAction(prompt.id, n);
    if (!b) return toast("That version could not be opened.", { tone: "bad" });
    setViewing({ number: n, bloks: b });
    say(`Viewing version ${n}, read-only.`);
    listRef.current?.closest("main")?.scrollTo?.({ top: 0 });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function restore(n: number) {
    setBusy(true);
    await autosave.settle();
    const r = await restoreVersionAction(prompt.id, n);
    setBusy(false);
    if (!r.ok) return toast(r.error, { tone: "bad" });
    bloksRef.current = r.bloks;
    setBloks(r.bloks);
    autosave.setHead(r.version.number);
    clearDraft(userId, prompt.id);
    setVersions((vs) => [r.version, ...vs]);
    setViewing(null);
    touchRail({ versions: r.version.number, updatedAt: r.version.createdAt, bloksCount: r.bloks.length });
    toast(`Restored v${n} as v${r.version.number}. Nothing was overwritten.`);
  }

  async function nameHead(name: string) {
    await autosave.settle();
    const n = versions[0]?.number;
    if (!n) return;
    const ok = await nameVersionAction(prompt.id, n, name);
    if (!ok) return toast("The name did not save.", { tone: "bad" });
    setVersions((vs) => vs.map((v) => (v.number === n ? { ...v, name } : v)));
    toast(`Named v${n} “${name}”.`);
  }

  // ---- Name -----------------------------------------------------------------
  async function rename(el: HTMLElement) {
    const wanted = slugify(el.innerText, slug);
    if (wanted === slug) {
      el.innerText = slug;
      return;
    }
    el.innerText = wanted;
    const r = await renamePromptAction(prompt.id, wanted);
    if (!r.ok) {
      el.innerText = slug;
      return toast(r.error, { tone: "bad" });
    }
    setSlug(r.slug);
    touchRail({ slug: r.slug });
    toast(`Renamed to ${r.slug}.`);
    router.replace(`/p/${r.slug}`, { scroll: false });
  }

  const nb = bloks.length;
  const nv = variables.length;
  const order = bloks.map((b) => b.id);
  const orderKey = order.join();
  const shown = viewing ? viewing.bloks : bloks;

  return (
    <div className={s.ed}>
      <Rail items={rail} currentId={prompt.id} keysLabel={props.keysLabel} />
      <SearchHotkey />

      <main className={cx(s.main, "sheet-area app-bg")} id="main">
        <div className={s.title}>
          <div>
            <span className="sheetno">Sheet {String(prompt.sheetNumber).padStart(2, "0")} · Rev {head} · Private</span>
            <h1>
              <span
                contentEditable="plaintext-only"
                suppressContentEditableWarning
                spellCheck={false}
                role="textbox"
                aria-label="Prompt name"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                  if (e.key === "Escape") {
                    e.currentTarget.innerText = slug;
                    e.currentTarget.blur();
                  }
                }}
                onBlur={(e) => void rename(e.currentTarget)}
              >
                {slug}
              </span>
            </h1>
          </div>
          <div className={s.meta}>
            <span>{nb} {nb === 1 ? "blok" : "bloks"} · {nv} {nv === 1 ? "variable" : "variables"}</span>
            <span className={s.savestate} data-state={autosave.state} role="status">
              {autosave.state === "saving" ? <span className="spin-dash" aria-hidden="true" /> : <Icon name={autosave.state === "error" ? "x" : "check"} size="sm" />}
              <span>{autosave.state === "saving" ? "Saving" : autosave.state === "error" ? "Not saved · retrying" : `Saved · v${head}`}</span>
            </span>
          </div>
        </div>

        <div className={s.perfbar} role="toolbar" aria-label="Performance tools">
          <span className={s.perfLead}><span className="stamp">Performance</span></span>
          <PerfButton feature="The linter"><Icon name="scan" />Lint</PerfButton>
          <PerfButton feature="Tests"><Icon name="flask" />Run tests</PerfButton>
          <PerfButton feature="Side-by-side runs"><Icon name="columns" />Compare</PerfButton>
          <PerfButton feature="Semantic diff"><Icon name="diff" />Diff</PerfButton>
          <PerfButton feature="Share pages"><Icon name="share" />Share</PerfButton>
          <PerfButton feature="Typed export"><Icon name="code" />Export .ts</PerfButton>
        </div>

        {draft && !viewing && (
          <div className={s.draftBar} role="status">
            <Icon name="history" />
            <span>Unsaved changes from {relativeTime(new Date(draft.at)).toLowerCase()} were kept on this device.</span>
            <button className="btn btn--sm btn--primary" type="button" onClick={() => { commit(draft.bloks); setDraft(null); toast("Restored your unsaved changes."); }}>Restore them</button>
            <button className="btn btn--sm" type="button" onClick={() => { clearDraft(userId, prompt.id); setDraft(null); }}>Discard</button>
          </div>
        )}

        {viewing && (
          <div className={s.viewing} role="status">
            <Icon name="eye" />
            <span>Viewing v{viewing.number} · read-only. Restoring it adds a new version; nothing is overwritten.</span>
            <button className="btn btn--sm btn--primary" type="button" disabled={busy} onClick={() => restore(viewing.number)}>Restore v{viewing.number}</button>
            <button className="btn btn--sm" type="button" onClick={() => setViewing(null)}>Back to current</button>
          </div>
        )}

        {viewing ? (
          <div className={s.list} ref={listRef} data-readonly="" aria-label={`Bloks in v${viewing.number}`}>
            {shown.map((b) => <BlokCard key={b.id} blok={b} readOnly />)}
          </div>
        ) : (
          <Reorder.Group as="div" axis="y" values={order} onReorder={onReorder} className={s.list} ref={listRef} aria-label="Bloks">
            <AnimatePresence initial={false}>
              {bloks.map((b, i) => (
                <DraggableBlok
                  key={b.id}
                  id={b.id}
                  orderKey={orderKey}
                  onStart={() => {
                    dragStart.current = orderKey;
                    setLifted(b.id);
                  }}
                  onEnd={() => dragEnd(b.id)}
                >
                  {(gripDown) => (
                    <BlokCard
                      blok={b}
                      fresh={fresh.has(b.id)}
                      lifted={lifted === b.id}
                      enterDelay={settled ? undefined : 120 + i * 90}
                      onText={onText}
                      onType={retype}
                      onDuplicate={duplicate}
                      onDelete={remove}
                      onSplit={split}
                      onCaret={(id, o) => (caret.current[id] = o)}
                      onGripDown={gripDown}
                      onGripKey={move}
                    />
                  )}
                </DraggableBlok>
              ))}
            </AnimatePresence>
          </Reorder.Group>
        )}

        {!viewing && bloks.length === 0 && <div className={s.emptySheet}>This prompt has no bloks. Add one below.</div>}

        {!viewing && (
          <>
            <div className={s.addbar} role="group" aria-label="Add a blok">
              <span className="label">Add blok</span>
              {BLOK_TYPES.map((t) => (
                <button key={t} className="btn" type="button" data-add={t} onClick={() => add(t)}>
                  <Icon name="plus" />
                  {BLOK_LABEL[t]}
                </button>
              ))}
            </div>
            <p className={s.hint}>Hover a blok to see its span in the compiled prompt. Drag the grip, or focus it and press ↑ ↓, to reorder. Split a blok at the cursor with Ctrl+Shift+Enter. Every save is a version.</p>
          </>
        )}
        <p className="sr-only" aria-live="polite">{live}</p>
      </main>

      <aside className={s.side} aria-label="Output">
        <TabList
          idPrefix="out"
          label="Output panels"
          value={tab}
          onChange={setTab}
          items={[
            { id: "compiled", label: "Compiled" },
            { id: "run", label: "Run" },
            { id: "history", label: <>History · {versions.length}</> },
          ]}
        />
        <TabPanel idPrefix="out" id="compiled" active={tab === "compiled"} className={s.panel}>
          <CompiledPanel
            ref={compiledRef}
            compiled={compiled}
            mode={mode}
            setMode={setMode}
            values={values}
            setValue={setValue}
            copyMarkdown={() => toMarkdown(slug, source)}
            copyJson={() => toJson(slug, viewing ? viewing.number : head, source)}
          />
        </TabPanel>
        <TabPanel idPrefix="out" id="run" active={tab === "run"} className={s.panel}>
          <RunPanel storageKey={`41p:run:${userId}:${prompt.id}`} keys={props.keys} system={runSystem} missing={variables.filter((v) => !values[v]?.trim())} />
        </TabPanel>
        <TabPanel idPrefix="out" id="history" active={tab === "history"} className={s.panel}>
          <HistoryPanel versions={versions} viewing={viewing?.number ?? null} busy={busy} onOpen={open} onRestore={restore} onName={nameHead} />
        </TabPanel>
      </aside>
    </div>
  );
}

function DraggableBlok({ id, orderKey, onStart, onEnd, children }: { id: string; orderKey: string; onStart: () => void; onEnd: () => void; children: (gripDown: (e: React.PointerEvent) => void) => React.ReactNode }) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      as="div"
      value={id}
      dragListener={false}
      dragControls={controls}
      layoutDependency={orderKey}
      onDragStart={onStart}
      onDragEnd={onEnd}
      style={{ position: "relative" }}
      exit={{ opacity: 0, x: -16, scale: 0.98, transition: { duration: 0.3, ease: EASE_BRAND } }}
      transition={{ layout: { duration: 0.3, ease: EASE_BRAND } }}
    >
      {children((e) => {
        e.preventDefault();
        controls.start(e);
      })}
    </Reorder.Item>
  );
}
