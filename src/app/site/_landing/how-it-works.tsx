"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { cx } from "@/lib/cx";
import { useMediaQuery, usePrefersReducedMotion } from "../_motion/reduced-motion";
import s from "../landing.module.css";

/* Sheet 02 (DESIGN.md §8): scroll-driven. Eight text bars morph between three
   states (paste → four bloks → compiled column), with a dashed connector and
   a stamp for tests. Wide screens follow the step in the middle of the
   viewport; phones cycle every 3.6 s while the drawing is on screen. Reduced
   motion shows state 3 with every step active. Ported from landing.js. */

type State = 1 | 2 | 3;

const CAPS: Record<State, string> = { 1: "Sheet 02 · Pasted · 8 lines", 2: "Sheet 02 · 4 bloks", 3: "Sheet 02 · Compiled · 186 tokens" };

const FRAMES = [
  { type: "context", t: "8%", label: "Context · B1" },
  { type: "constraint", t: "29%", label: "Constraint · B2" },
  { type: "example", t: "50%", label: "Example · B3" },
  { type: "expects", t: "71%", label: "Expects · B4" },
] as const;

/* Each bar's top and width in state 1 (paste), 2 (bloks) and 3 (compiled). */
const BARS = [
  ["context", "22%", "70%", "15%", "56%", "15%", "28%"],
  ["context", "29%", "62%", "19.5%", "46%", "19.5%", "22%"],
  ["constraint", "36%", "68%", "36%", "54%", "36%", "27%"],
  ["constraint", "43%", "38%", "40.5%", "30%", "40.5%", "15%"],
  ["example", "50%", "66%", "57%", "52%", "57%", "26%"],
  ["example", "57%", "56%", "61.5%", "44%", "61.5%", "22%"],
  ["expects", "64%", "64%", "78%", "50%", "78%", "25%"],
  ["expects", "71%", "28%", "82.5%", "22%", "82.5%", "11%"],
] as const;

const COMPILED = [
  ["20%", "78%"],
  ["27%", "60%"],
  ["40%", "74%"],
  ["47%", "40%"],
  ["60%", "70%"],
  ["67%", "52%"],
] as const;

type Vars = React.CSSProperties & Record<`--${string}`, string | number>;

export function HowItWorks() {
  const reduce = usePrefersReducedMotion();
  const wide = useMediaQuery("(min-width: 961px)");
  const [state, setState] = useState<State>(1);
  const [copy, setCopy] = useState<"" | "press" | "copied">("");
  const shown: State = reduce ? 3 : state;

  const figRef = useRef<HTMLElement>(null);
  const stepRefs = useRef<Array<HTMLLIElement | null>>([]);
  const timers = useRef<number[]>([]);
  const current = useRef<State>(1);

  const go = useCallback((n: State) => {
    if (current.current === n) return;
    current.current = n;
    setState(n);
    setCopy("");
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    if (n === 3) {
      timers.current.push(
        window.setTimeout(() => {
          setCopy("press");
          timers.current.push(window.setTimeout(() => setCopy("copied"), 170));
        }, 2000),
      );
    }
  }, []);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  // Wide: the step crossing the middle band of the viewport sets the state.
  useEffect(() => {
    if (reduce || !wide) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) go(Number((en.target as HTMLElement).dataset.step) as State);
        });
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    stepRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [reduce, wide, go]);

  // Phones: cycle every 3.6 s, paused while offscreen or in a hidden tab.
  useEffect(() => {
    const fig = figRef.current;
    if (reduce || wide || !fig) return;
    let visible = false;
    const tick = window.setInterval(() => {
      if (!visible || document.hidden) return;
      go(((current.current % 3) + 1) as State);
    }, 3600);
    const io = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1]?.isIntersecting ?? false;
    });
    io.observe(fig);
    return () => {
      window.clearInterval(tick);
      io.disconnect();
    };
  }, [reduce, wide, go]);

  const steps = [
    {
      n: 1 as const,
      h: "Paste",
      p: (
        <>
          Bring the prompt you already run. Markdown and variables like <span className="var">{"{{name}}"}</span> stay exactly as you wrote them.
        </>
      ),
      tags: (
        <span className="chip chip--ok">
          <span className="dot" />
          Free
        </span>
      ),
    },
    {
      n: 2 as const,
      h: "Shape it into bloks",
      p: "Context, constraint, example, expects. Each blok owns a span of the final prompt, so you always know which part says what. Drag to reorder.",
      tags: (
        <span className="chip chip--ok">
          <span className="dot" />
          Free
        </span>
      ),
    },
    {
      n: 3 as const,
      h: "Copy it, or test it",
      p: "Copy the compiled prompt in one click. Expects bloks never reach the prompt. With Performance they become tests you run on every model.",
      tags: (
        <>
          <span className="chip chip--ok">
            <span className="dot" />
            Copy is free
          </span>
          <span className="stamp">Tests · Performance</span>
        </>
      ),
    },
  ];

  return (
    <div className={s.howGrid}>
      <ol className={s.howSteps}>
        {steps.map((step, i) => (
          <li
            key={step.n}
            className={cx(s.howStep, (reduce || shown === step.n) && s.isActive)}
            data-step={step.n}
            ref={(el) => {
              stepRefs.current[i] = el;
            }}
          >
            <button className={s.howBtn} type="button" aria-controls="howFig" onClick={() => go(step.n)}>
              <span className={cx(s.howN, "mono")}>0{step.n}</span>
              <span className={s.howH}>{step.h}</span>
            </button>
            <p>{step.p}</p>
            {step.tags}
          </li>
        ))}
      </ol>

      <div className={s.howSticky}>
        <figure
          ref={figRef}
          className={cx(s.howFig, "frame", copy === "copied" && s.isCopied, copy === "press" && s.isPress)}
          id="howFig"
          data-state={shown}
          aria-label="Drawing of the three steps. It changes as you scroll."
        >
          <figcaption className={s.howCap}>
            <span className="label">{CAPS[shown]}</span>
            <span className="titleblock">
              <span>Sheet 02</span>
              <span>State {shown}/3</span>
            </span>
          </figcaption>
          <div className={s.howCanvas}>
            <div className={s.hp} aria-hidden="true" />
            {FRAMES.map((f) => (
              <div key={f.type} className={s.hf} style={{ "--t": f.t } as Vars} data-type={f.type} aria-hidden="true">
                <span className={s.hfL}>{f.label}</span>
              </div>
            ))}
            {BARS.map(([type, t1, w1, t2, w2, t3, w3], i) => (
              <i key={i} className={s.hb} data-type={type} style={{ "--i": i, "--t1": t1, "--w1": w1, "--t2": t2, "--w2": w2, "--t3": t3, "--w3": w3 } as Vars} />
            ))}
            <span className={s.hcaret} aria-hidden="true" />
            <div className={s.hc} aria-hidden="true">
              <span className={s.hcL}>Compiled · 186 tok</span>
              {COMPILED.map(([t, w], i) => (
                <i key={i} className={s.hcb} style={{ "--i": i, "--t": t, "--w": w } as Vars} />
              ))}
              <span className={s.hcopy}>
                <Icon name="copy" size="sm" />
                <span className={s.hcopyA}>Copy</span>
                <span className={s.hcopyB}>Copied</span>
              </span>
            </div>
            <svg className={s.hx} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <path d="M46 16.5 C50 16.5 50 18 54 18" />
              <path d="M46 37.5 C50 37.5 50 34 54 34" />
              <path d="M46 58.5 C50 58.5 50 50 54 50" />
              <path className={s.hxTest} d="M46 79.5 H56" />
            </svg>
            <span className={cx(s.ht, "stamp")} aria-hidden="true">
              Tests
            </span>
          </div>
        </figure>
      </div>
    </div>
  );
}
