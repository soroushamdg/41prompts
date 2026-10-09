"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { cx } from "@/lib/cx";

/* One toast at a time, bottom centre, with at most one action (Undo).
   Copy confirms in the past tense ("Copied", "Restored v5 as v9"). */

export type ToastOptions = { action?: string; onAction?: () => void; ms?: number; tone?: "bad" };
type ToastFn = (message: string, options?: ToastOptions) => void;
type Current = { id: number; message: string; options: ToastOptions };

const ToastContext = createContext<ToastFn>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<Current | null>(null);
  const [on, setOn] = useState(false);
  const timer = useRef<number>(0);
  const seq = useRef(0);

  const toast = useCallback<ToastFn>((message, options = {}) => {
    window.clearTimeout(timer.current);
    seq.current += 1;
    setCurrent({ id: seq.current, message, options });
    requestAnimationFrame(() => setOn(true));
    timer.current = window.setTimeout(() => setOn(false), options.ms ?? 4200);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className={cx("toast", on && "is-on")} role="status" aria-live="polite" data-tone={current?.options.tone}>
        {current && (
          <>
            <span>{current.message}</span>
            {current.options.action && (
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => {
                  window.clearTimeout(timer.current);
                  setOn(false);
                  current.options.onAction?.();
                }}
              >
                {current.options.action}
              </button>
            )}
          </>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastFn {
  return useContext(ToastContext);
}
