"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Blok } from "@/lib/bloks";
import { draftKey } from "@/lib/drafts";
import type { SaveResult } from "@/server/versions";

/* Autosave (M02, M05). Every change burst becomes one version:
   - saves 1 s after the last change, or every 10 s while typing goes on;
   - one request at a time, always with the newest snapshot;
   - retries reuse the same clientSaveId, so the server never doubles a version;
   - a local draft survives a crash or a closed tab until the server confirms;
   - leaving the page flushes (keepalive only under the 64 KB browser limit). */

export type SaveState = "saved" | "saving" | "error";
export type Draft = { bloks: Blok[]; baseVersion: number; at: number };

type Pending = { bloks: Blok[]; id: string };

const IDLE_MS = 1000;
const MAX_WAIT_MS = 10_000;
const KEEPALIVE_LIMIT = 60_000;

function newId() {
  return crypto.randomUUID().replace(/-/g, "");
}

export function readDraft(userId: string, promptId: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(userId, promptId));
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export function clearDraft(userId: string, promptId: string) {
  try {
    localStorage.removeItem(draftKey(userId, promptId));
  } catch {
    /* storage unavailable */
  }
}

type Options = {
  userId: string;
  promptId: string;
  initialHead: number;
  onSaved: (result: SaveResult) => void;
  onSignedOut: () => void;
};

export function useAutosave({ userId, promptId, initialHead, onSaved, onSignedOut }: Options) {
  const [state, setState] = useState<SaveState>("saved");
  const pending = useRef<Pending | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  const head = useRef(initialHead);
  const idle = useRef<number>(0);
  const maxWait = useRef<number>(0);
  const retry = useRef<number>(0);
  const attempts = useRef(0);
  const cb = useRef({ onSaved, onSignedOut });
  const flushRef = useRef<() => void>(() => {});
  useEffect(() => {
    cb.current = { onSaved, onSignedOut };
  });

  const url = `/api/prompts/${promptId}/versions`;

  const clearTimers = () => {
    window.clearTimeout(idle.current);
    window.clearTimeout(maxWait.current);
    window.clearTimeout(retry.current);
    idle.current = maxWait.current = retry.current = 0;
  };

  const send = useCallback(
    async (p: Pending, keepalive = false): Promise<void> => {
      const body = JSON.stringify({ bloks: p.bloks, baseVersion: head.current, clientSaveId: p.id });
      try {
        const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: keepalive && body.length < KEEPALIVE_LIMIT });
        if (res.status === 401) {
          setState("error");
          cb.current.onSignedOut();
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as SaveResult;
        attempts.current = 0;
        head.current = Math.max(head.current, data.version.number);
        cb.current.onSaved(data);
        if (!pending.current) {
          clearDraft(userId, promptId);
          setState("saved");
        }
      } catch {
        // Keep the snapshot (and its ID) unless something newer replaced it.
        if (!pending.current) pending.current = p;
        setState("error");
        attempts.current += 1;
        const wait = Math.min(30_000, 1500 * 2 ** Math.min(attempts.current, 4));
        window.clearTimeout(retry.current);
        retry.current = window.setTimeout(() => {
          retry.current = 0;
          flushRef.current();
        }, wait);
      }
    },
    [url, userId, promptId],
  );

  const flush = useCallback(
    async (keepalive = false): Promise<void> => {
      window.clearTimeout(idle.current);
      window.clearTimeout(maxWait.current);
      idle.current = maxWait.current = 0;
      if (inflight.current) return;
      const p = pending.current;
      if (!p) return;
      pending.current = null;
      const run = send(p, keepalive).finally(() => {
        inflight.current = null;
        if (pending.current && !retry.current) idle.current = window.setTimeout(() => flushRef.current(), 250);
      });
      inflight.current = run;
      await run;
    },
    [send],
  );

  useEffect(() => {
    flushRef.current = () => void flush();
  }, [flush]);

  /** Call after every change with the full new snapshot. */
  const change = useCallback(
    (bloks: Blok[]) => {
      // A new snapshot is a new save; only a retry of the same snapshot reuses its ID.
      pending.current = { bloks, id: newId() };
      try {
        localStorage.setItem(draftKey(userId, promptId), JSON.stringify({ bloks, baseVersion: head.current, at: Date.now() } satisfies Draft));
      } catch {
        /* storage full or unavailable: the server save still runs */
      }
      setState("saving");
      window.clearTimeout(idle.current);
      idle.current = window.setTimeout(() => void flush(), IDLE_MS);
      if (!maxWait.current) maxWait.current = window.setTimeout(() => void flush(), MAX_WAIT_MS);
    },
    [flush, userId, promptId],
  );

  /** Resolves once everything typed so far is saved (or failed). */
  const settle = useCallback(async () => {
    for (let i = 0; i < 40 && (pending.current || inflight.current); i++) {
      if (inflight.current) await inflight.current;
      else await flush();
    }
  }, [flush]);

  /** Adopt a version created elsewhere (restore). */
  const setHead = useCallback((n: number) => {
    head.current = Math.max(head.current, n);
  }, []);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    const onPageHide = () => void flush(true);
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pending.current || inflight.current) {
        void flush(true);
        e.preventDefault();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      clearTimers();
    };
  }, [flush]);

  return { state, change, flush, settle, setHead, head };
}
