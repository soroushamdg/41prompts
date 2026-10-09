"use client";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Icon } from "@/components/icon";
import { EASE_BRAND } from "@/components/motion-provider";
import { PerfButton } from "@/components/upgrade/upgrade";
import { versionTime } from "@/lib/time";
import type { VersionMeta } from "@/server/versions";
import s from "./editor.module.css";

type Props = {
  versions: VersionMeta[];
  viewing: number | null;
  busy: boolean;
  onOpen: (n: number) => void;
  onRestore: (n: number) => void;
  onName: (name: string) => Promise<void>;
};

const PAGE = 50;

/** History (M05): every version, newest first. Restoring adds a version. */
export function HistoryPanel({ versions, viewing, busy, onOpen, onRestore, onName }: Props) {
  const [naming, setNaming] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const head = versions[0]?.number ?? 0;
  const now = new Date();

  return (
    <>
      <div className={s.vlist}>
        <AnimatePresence initial={false}>
          {versions.slice(0, shown).map((v) => (
            <motion.div
              key={v.number}
              layout="position"
              className={s.vrow}
              data-current={v.number === head ? "" : undefined}
              data-viewing={v.number === viewing ? "" : undefined}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.52, ease: EASE_BRAND } }}
            >
              <span className={s.vdot}><span /></span>
              <div className={s.vmain}>
                <div className={s.vtop}>
                  <span className="mono">v{v.number}</span>
                  <time dateTime={v.createdAt} suppressHydrationWarning>{versionTime(new Date(v.createdAt), now)}</time>
                  {v.name && <span className={s.vname}>{v.name}</span>}
                </div>
                <div className={s.vnote}>{v.note}</div>
              </div>
              {v.number === head ? (
                <span className={s.vcur}>CURRENT</span>
              ) : (
                <span className={s.vacts}>
                  <button className="btn btn--sm btn--bare btn--icon" type="button" aria-label={`Open v${v.number} read-only`} title="Open read-only" onClick={() => onOpen(v.number)}>
                    <Icon name="eye" />
                  </button>
                  <button className="btn btn--sm" type="button" disabled={busy} onClick={() => onRestore(v.number)}>Restore</button>
                </span>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {versions.length > shown && (
        <button className={`btn btn--sm ${s.more}`} type="button" onClick={() => setShown((n) => n + PAGE)}>
          Show older versions
        </button>
      )}
      {naming ? (
        <NameForm onDone={async (name) => { setNaming(false); if (name) await onName(name); }} />
      ) : (
        <button className="btn btn--dashed btn--block" type="button" onClick={() => setNaming(true)}>Name this version</button>
      )}
      <PerfButton feature="Semantic diff" className="btn--block"><Icon name="diff" />Compare two versions <span className="stamp">Performance</span></PerfButton>
    </>
  );
}

function NameForm({ onDone }: { onDone: (name: string | null) => void }) {
  const [value, setValue] = useState("");
  return (
    <form className={s.keyform} onSubmit={(e) => { e.preventDefault(); onDone(value.trim() || null); }}>
      <label className="sr-only" htmlFor="vName">Version name</label>
      <input
        className="input input--mono"
        id="vName"
        placeholder="works on Claude"
        autoComplete="off"
        autoFocus
        maxLength={60}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") onDone(null); }}
      />
      <button className="btn btn--primary" type="submit">Save name</button>
    </form>
  );
}
