"use client";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icon";
import { relativeTime } from "@/lib/time";
import type { LibraryItem } from "@/server/prompts";
import s from "./editor.module.css";

/** The library rail beside the sheet: search by name, current prompt marked. */
export function Rail({ items, currentId, modelsLabel, hasModels }: { items: LibraryItem[]; currentId: string; modelsLabel: string; hasModels: boolean }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = items.filter((p) => !needle || p.slug.includes(needle));
  const now = new Date();
  return (
    <aside className={s.rail} aria-label="Library">
      <Link className="btn btn--primary btn--block" href="/new"><Icon name="plus" />New prompt</Link>
      <label className="searchbox">
        <Icon name="search" />
        <input type="search" data-search="" placeholder="Search by name" aria-label="Search prompts by name" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="kbd">⌘K</span>
      </label>
      <div className={s.sideRow}><span className="label">Private library</span><span className="label">{items.length}</span></div>
      <nav className={s.railList} aria-label="Prompts">
        <AnimatePresence initial={false}>
          {shown.map((p) => (
            <motion.div key={p.id} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Link className={s.railItem} href={`/p/${p.slug}`} aria-current={p.id === currentId ? "page" : undefined}>
                <b><span>{p.slug}</span> <span>v{p.versions}</span></b>
                <span><time dateTime={p.updatedAt} suppressHydrationWarning>{relativeTime(new Date(p.updatedAt), now)}</time></span>
              </Link>
            </motion.div>
          ))}
        </AnimatePresence>
      </nav>
      <Link className={s.railKeys} href={hasModels ? "/settings#models" : "/settings?add=1#models"}><Icon name="cpu" />{modelsLabel}</Link>
    </aside>
  );
}
