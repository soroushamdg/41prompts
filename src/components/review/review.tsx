"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@/components/dialog";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { track } from "@/lib/analytics";
import { mayAskForReview, PH_BADGE_ALT, PH_BADGE_SRC, PH_REVIEW_URL, REVIEW_RULES, type ReviewStage, type ReviewState } from "@/lib/product-hunt";
import { reviewAnswerAction, reviewAskedAction } from "@/server/actions/review";
import s from "./review.module.css";

/* Asks for a Product Hunt review at moments someone has just got value out
   of 41prompts (a finished run, a tenth version, a fifth copy, coming back
   after a week). Calm by design: at most once per visit, never while
   another dialog is open, and "Never ask me again" is final. */

type Ctx = { askForReview: (stage: ReviewStage) => void };
const ReviewContext = createContext<Ctx>({ askForReview: () => {} });
export const useReviewPrompt = () => useContext(ReviewContext);

let askedThisVisit = false;

/** The Product Hunt review badge, exactly as Product Hunt's embed draws it. */
export function ProductHuntBadge({ onClick, className }: { onClick?: () => void; className?: string }) {
  return (
    <a className={className} href={PH_REVIEW_URL} target="_blank" rel="noopener noreferrer" onClick={onClick}>
      {/* eslint-disable-next-line @next/next/no-img-element -- third-party SVG badge, served by Product Hunt */}
      <img src={PH_BADGE_SRC} alt={PH_BADGE_ALT} width={250} height={54} style={{ width: 250, height: 54 }} />
    </a>
  );
}

export function ReviewProvider({ initial, children }: { initial: ReviewState; children: React.ReactNode }) {
  const toast = useToast();
  const [state, setState] = useState(initial);
  const [open, setOpen] = useState<ReviewStage | null>(null);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const askForReview = useCallback((stage: ReviewStage) => {
    if (askedThisVisit || !mayAskForReview(stateRef.current)) return;
    askedThisVisit = true;
    // A calm moment: after whatever just happened has settled, and never on top of another dialog.
    window.setTimeout(() => {
      if (document.querySelector("dialog[open]") || document.activeElement?.getAttribute("contenteditable")) {
        askedThisVisit = false;
        return;
      }
      setOpen(stage);
      setState((st) => ({ ...st, askCount: st.askCount + 1, lastAskedAt: new Date().toISOString() }));
      void reviewAskedAction(stage);
      track("review_prompt_shown", { stage });
    }, 1500);
  }, []);

  // Coming back after a week counts as a stage of its own.
  useEffect(() => {
    const age = Date.now() - new Date(initial.accountCreatedAt).getTime();
    if (age < REVIEW_RULES.returningAfterDays * 86_400_000) return;
    const t = window.setTimeout(() => askForReview("returning"), 4000);
    return () => window.clearTimeout(t);
  }, [initial.accountCreatedAt, askForReview]);

  function answer(kind: "later" | "never" | "reviewed") {
    const stage = open;
    setOpen(null);
    setState((st) => ({ ...st, status: kind === "later" ? "snoozed" : kind, snoozedUntil: kind === "later" ? new Date(Date.now() + REVIEW_RULES.snoozeDays * 86_400_000).toISOString() : null }));
    void reviewAnswerAction(kind);
    track(kind === "reviewed" ? "review_prompt_clicked" : kind === "later" ? "review_prompt_later" : "review_prompt_never", { stage: stage ?? "unknown" });
    if (kind === "reviewed") toast("Thank you. The review opened in a new tab.");
    if (kind === "never") toast("Understood. We will not ask again.");
  }

  const value = useMemo(() => ({ askForReview }), [askForReview]);
  return (
    <ReviewContext.Provider value={value}>
      {children}
      <Dialog open={open !== null} onClose={() => open && answer("later")} labelledBy="reviewTitle" className={s.dialog}>
        <div className="dlg__panel frame">
          <button type="button" className="btn btn--icon btn--sm btn--bare dlg__close" onClick={() => answer("later")} aria-label="Close">
            <Icon name="x" />
          </button>
          <span className="sheetno">A short favour</span>
          <h2 className={s.title} id="reviewTitle">Is 41prompts working for you?</h2>
          <p className={s.p}>If it has saved you some guessing, a short review on Product Hunt helps other people who write prompts find it. It takes about a minute.</p>
          <ProductHuntBadge className={s.badge} onClick={() => answer("reviewed")} />
          <div className={s.actions}>
            <button type="button" className="btn btn--bare btn--sm" onClick={() => answer("never")}>Never ask me again</button>
            <button type="button" className="btn btn--sm" onClick={() => answer("later")}>Ask me later</button>
          </div>
        </div>
      </Dialog>
    </ReviewContext.Provider>
  );
}

const COPIES_KEY = "41p:copies";

/** Counts prompt copies on this device; the fifth one is a review moment. */
export function countCopy(): number {
  try {
    const n = Number(localStorage.getItem(COPIES_KEY) || 0) + 1;
    localStorage.setItem(COPIES_KEY, String(n));
    return n;
  } catch {
    return 0;
  }
}
