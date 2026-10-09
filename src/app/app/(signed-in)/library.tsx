"use client";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { EASE_BRAND } from "@/components/motion-provider";
import { useToast } from "@/components/toast";
import { PerfButton } from "@/components/upgrade/upgrade";
import { cx } from "@/lib/cx";
import { slugify } from "@/lib/slug";
import { relativeTime } from "@/lib/time";
import { archivePromptAction, deletePromptAction, duplicatePromptAction, renamePromptAction, undoDeletePromptAction } from "@/server/actions/prompts";
import type { LibraryItem } from "@/server/prompts";
import s from "./library.module.css";

type Sort = "edited" | "name" | "versions";

function sorter(by: Sort) {
  return (a: LibraryItem, b: LibraryItem) =>
    by === "name" ? a.slug.localeCompare(b.slug) : by === "versions" ? b.versions - a.versions || b.updatedAt.localeCompare(a.updatedAt) : b.updatedAt.localeCompare(a.updatedAt);
}

function Highlight({ name, needle }: { name: string; needle: string }) {
  const i = needle ? name.indexOf(needle) : -1;
  if (i < 0) return <>{name}</>;
  return (
    <>
      {name.slice(0, i)}
      <mark className="hit">{name.slice(i, i + needle.length)}</mark>
      {name.slice(i + needle.length)}
    </>
  );
}

export function Library({ initial }: { initial: LibraryItem[] }) {
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("edited");
  const [archivedView, setArchivedView] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  // Rows cascade in on the first paint only; later rows rise in at once.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), 1200);
    return () => clearTimeout(t);
  }, []);
  const search = useRef<HTMLInputElement>(null);

  const needle = q.trim().toLowerCase();
  const shelf = items.filter((p) => p.archived === archivedView);
  const visible = useMemo(() => shelf.filter((p) => !needle || p.slug.includes(needle)).sort(sorter(sort)), [shelf, needle, sort]);
  const archivedCount = items.filter((p) => p.archived).length;
  const active = items.filter((p) => !p.archived);
  const totalVersions = active.reduce((n, p) => n + p.versions, 0);
  const now = new Date();

  const update = (id: string, patch: Partial<LibraryItem>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  async function remove(p: LibraryItem) {
    const index = items.findIndex((x) => x.id === p.id);
    setItems((xs) => xs.filter((x) => x.id !== p.id));
    const res = await deletePromptAction(p.id);
    if (!res.ok) {
      setItems((xs) => [...xs.slice(0, index), p, ...xs.slice(index)]);
      toast(res.error, { tone: "bad" });
      return;
    }
    toast(`Deleted ${p.slug}.`, {
      action: "Undo",
      ms: 6000,
      onAction: async () => {
        const back = await undoDeletePromptAction(p.id);
        if (!back.ok) return toast(back.error, { tone: "bad" });
        setItems((xs) => [...xs.slice(0, index), back.item, ...xs.slice(index)]);
        toast(back.item.slug === p.slug ? `Restored ${p.slug}.` : `Restored as ${back.item.slug}.`);
      },
    });
  }

  async function archive(p: LibraryItem, archived: boolean) {
    update(p.id, { archived });
    const res = await archivePromptAction(p.id, archived);
    if (!res.ok) {
      update(p.id, { archived: !archived });
      return toast(res.error, { tone: "bad" });
    }
    if (!archived) return toast(`Unarchived ${p.slug}.`);
    toast(`Archived ${p.slug}.`, {
      action: "Undo",
      ms: 6000,
      onAction: async () => {
        update(p.id, { archived: false });
        await archivePromptAction(p.id, false);
        toast(`Restored ${p.slug}.`);
      },
    });
  }

  async function duplicate(p: LibraryItem) {
    const res = await duplicatePromptAction(p.id);
    if (!res.ok) return toast(res.error, { tone: "bad" });
    setItems((xs) => {
      const i = xs.findIndex((x) => x.id === p.id);
      return [...xs.slice(0, i + 1), res.item, ...xs.slice(i + 1)];
    });
    toast(`Duplicated as ${res.item.slug}.`);
  }

  async function rename(p: LibraryItem, value: string | null) {
    setRenaming(null);
    if (value === null) return;
    const wanted = slugify(value, p.slug);
    if (wanted === p.slug) return;
    update(p.id, { slug: wanted });
    const res = await renamePromptAction(p.id, wanted);
    if (!res.ok) {
      update(p.id, { slug: p.slug });
      return toast(res.error, { tone: "bad" });
    }
    update(p.id, { slug: res.slug });
    toast(`Renamed to ${res.slug}.`);
  }

  if (!items.length) {
    return (
      <div className={cx("frame", s.blank)}>
        <h2>Your library is empty.</h2>
        <p>Paste a prompt you already use, or start blank from a blok. It stays private and saves itself as you go.</p>
        <Link className="btn btn--primary btn--go" href="/new"><Icon name="plus" />New prompt</Link>
      </div>
    );
  }

  return (
    <>
      <div className={s.tools}>
        <label className="searchbox">
          <Icon name="search" />
          <input ref={search} type="search" data-search="" placeholder="Search by name" aria-label="Search prompts by name" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="kbd">⌘K</span>
        </label>
        <PerfButton feature="Search inside prompts" className="btn--sm"><Icon name="search" />Search inside prompts <span className="stamp">Performance</span></PerfButton>
        <PerfButton feature="Tags and filters" className="btn--sm"><Icon name="tag" />Tags <span className="stamp">Performance</span></PerfButton>
        <div className={s.toolsEnd}>
          <label htmlFor="libSort" className="label">Sort</label>
          <select id="libSort" className="input" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="edited">Last edited</option>
            <option value="name">Name</option>
            <option value="versions">Most versions</option>
          </select>
        </div>
      </div>

      {archivedView && (
        <div className={s.archivedBar}>
          <Icon name="archive" size="sm" /> Archived prompts. They keep every version and stay out of the library.
          <button className="btn btn--sm" type="button" onClick={() => setArchivedView(false)}>Back to library</button>
        </div>
      )}

      <div className="table-wrap">
        <table className="table" aria-label={archivedView ? "Archived prompts" : "Prompts"}>
          <thead>
            <tr><th scope="col">Name</th><th scope="col">Bloks</th><th scope="col">Versions</th><th scope="col">Last edited</th><th scope="col">Access</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {visible.map((p, i) => (
                <motion.tr
                  key={p.id}
                  layout="position"
                  className={s.row}
                  data-name={p.slug}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0, transition: { duration: !settled ? 0.6 : 0.42, delay: !settled ? 0.08 + i * 0.045 : 0, ease: EASE_BRAND } }}
                  exit={{ opacity: 0, x: 24, transition: { duration: 0.38, ease: EASE_BRAND } }}
                >
                  <td>
                    <div className={s.name}>
                      {renaming === p.id ? (
                        <RenameInput initial={p.slug} onDone={(v) => rename(p, v)} />
                      ) : (
                        <Link href={`/p/${p.slug}`}><Highlight name={p.slug} needle={needle} /></Link>
                      )}
                      {p.description && <span>{p.description}</span>}
                    </div>
                  </td>
                  <td className="num">{p.bloksCount}</td>
                  <td className="num">{p.versions}</td>
                  <td><time dateTime={p.updatedAt} suppressHydrationWarning>{relativeTime(new Date(p.updatedAt), now)}</time></td>
                  <td><span className={s.access}><Icon name="lock" size="sm" />Private</span></td>
                  <td>
                    <div className={s.rowActions}>
                      {archivedView ? (
                        <>
                          <button className="btn btn--icon btn--sm btn--bare" type="button" onClick={() => archive(p, false)} aria-label={`Unarchive ${p.slug}`} title="Unarchive"><Icon name="history" /></button>
                          <button className="btn btn--icon btn--sm btn--bare" type="button" onClick={() => remove(p)} aria-label={`Delete ${p.slug}`} title="Delete"><Icon name="trash" /></button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn--icon btn--sm btn--bare" type="button" onClick={() => duplicate(p)} aria-label={`Duplicate ${p.slug}`} title="Duplicate"><Icon name="copy" /></button>
                          <button className="btn btn--icon btn--sm btn--bare" type="button" onClick={() => setRenaming(p.id)} aria-label={`Rename ${p.slug}`} title="Rename"><Icon name="edit" /></button>
                          <button className="btn btn--icon btn--sm btn--bare" type="button" onClick={() => archive(p, true)} aria-label={`Archive ${p.slug}`} title="Archive"><Icon name="archive" /></button>
                          <button className="btn btn--icon btn--sm btn--bare" type="button" onClick={() => remove(p)} aria-label={`Delete ${p.slug}`} title="Delete"><Icon name="trash" /></button>
                        </>
                      )}
                    </div>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
        {needle && visible.length === 0 && (
          <div className={s.empty} role="status">
            No prompt names match “{q.trim()}”.{" "}
            <button className="btn btn--sm" type="button" onClick={() => { setQ(""); search.current?.focus(); }}>Clear search</button>
          </div>
        )}
        {!needle && visible.length === 0 && archivedView && <div className={s.empty} role="status">Nothing is archived.</div>}
      </div>

      <div className={s.foot}>
        <span>
          {active.length} {active.length === 1 ? "prompt" : "prompts"} · {totalVersions} {totalVersions === 1 ? "version" : "versions"}
          {needle ? ` · showing ${visible.length}` : ""}
        </span>
        <span>
          {archivedCount > 0 && !archivedView && (
            <>
              <button type="button" onClick={() => setArchivedView(true)}>Archived · {archivedCount}</button>
              {" · "}
            </>
          )}
          Autosaved · every save is a version
        </span>
      </div>
    </>
  );
}

function RenameInput({ initial, onDone }: { initial: string; onDone: (value: string | null) => void }) {
  const done = useRef(false);
  const finish = (v: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(v);
  };
  return (
    <input
      className="input input--mono"
      defaultValue={initial}
      aria-label={`New name for ${initial}`}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(e.currentTarget.value);
        if (e.key === "Escape") finish(null);
      }}
      onBlur={(e) => finish(e.currentTarget.value)}
    />
  );
}
