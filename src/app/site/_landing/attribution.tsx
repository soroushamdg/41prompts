"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "@/lib/cx";
import { drawPath, showPath } from "../_motion/draw-path";
import { prefersReducedMotion } from "../_motion/reduced-motion";
import { Count, RevealedProvider } from "../_motion/reveal";
import { routeLeader } from "../_motion/route-leader";
import { revealClass, useReveal } from "../_motion/use-reveal";
import s from "../landing.module.css";

/* P01 failure attribution (DESIGN.md §8): on reveal the cells count up; 1.5 s
   later the failing cell flushes red and a leader line draws from it to the
   blok, whose corners extend. Reduced motion shows the traced end state. */

const ROWS = [
  { id: "B2", check: "Reply under 80 words", cells: [[40, 100], [40, 160], [39, 220]] },
  { id: "B1", check: "Stays in role", cells: [[40, 280], [40, 340], [40, 400]] },
  { id: "B4", check: "Never promises a refund", cells: [[40, 460], [38, 520], [31, 580]] },
] as const;

export function Attribution() {
  const [traced, setTraced] = useState(false);
  const drawRef = useRef<HTMLDivElement>(null);
  const wireRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const cellRef = useRef<HTMLSpanElement>(null);
  const blokRef = useRef<HTMLDivElement>(null);
  const tracedRef = useRef(false);
  const timer = useRef(0);

  const attrTrace = useCallback((instant: boolean) => {
    const svg = wireRef.current;
    const path = pathRef.current;
    const cell = cellRef.current;
    const blok = blokRef.current;
    if (!svg || !path || !cell || !blok) return;
    routeLeader(svg, path, cell, blok, { side: "right", gutter: 16, pad: 2 });
    if (instant) showPath(path);
    else drawPath(path, 1000);
  }, []);

  const { ref, revealed } = useReveal<HTMLElement>({
    onReveal: () => {
      const reduce = prefersReducedMotion();
      timer.current = window.setTimeout(
        () => {
          tracedRef.current = true;
          setTraced(true);
          attrTrace(reduce);
        },
        reduce ? 0 : 1500,
      );
    },
  });

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Keep the leader line attached on resize.
  useEffect(() => {
    const host = drawRef.current;
    if (!host || typeof ResizeObserver === "undefined") return;
    let t = 0;
    const ro = new ResizeObserver(() => {
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        if (tracedRef.current) attrTrace(true);
      }, 120);
    });
    ro.observe(host);
    return () => {
      ro.disconnect();
      window.clearTimeout(t);
    };
  }, [attrTrace]);

  return (
    <article ref={ref} className={cx(s.show, s.showWide, "frame", revealClass("up", revealed))} id="attr" data-reveal="up">
      <RevealedProvider revealed={revealed}>
        <div className={s.showCopy}>
          <p className={cx("mono", s.showId)}>
            P01 <span className="stamp">Performance</span>
          </p>
          <h3>A red cell that points at a line.</h3>
          <p>
            Every check comes from a blok. When a check fails, 41prompts traces the failure back to the blok most likely to have caused it, with a confidence score, on each
            model separately.
          </p>
          <ul className={s.ticks}>
            <li>Failures attributed per model, not per prompt</li>
            <li>Click a failure to jump to the blok</li>
            <li>Checks that could not be graded are reported as that, never as a pass</li>
          </ul>
        </div>
        <div className={cx(s.attr, traced && s.isTraced)} ref={drawRef}>
          <p className={cx("label", s.attrEx)}>Example · one suite, three models</p>
          <div className={s.attrTable} role="table" aria-label="Example results: checks by model">
            <div className={cx(s.attrRow, s.attrRowHead)} role="row">
              <span role="columnheader">Check, and the blok it came from</span>
              <span role="columnheader">GPT</span>
              <span role="columnheader">Claude</span>
              <span role="columnheader">Gemini</span>
            </div>
            {ROWS.map((row, r) => (
              <div key={row.id} className={s.attrRow} role="row">
                <span role="cell">
                  <b className="mono">{row.id}</b> {row.check}
                </span>
                {row.cells.map(([n, delay], c) => {
                  const bad = r === 2 && c === 2;
                  return (
                    <span key={c} role="cell" className={cx(s.c, bad && s.cBad)} ref={bad ? cellRef : undefined}>
                      <Count to={n} delay={delay} />
                      /40
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
          <div className={cx(s.attrBlok, "blok frame")} data-type="example" ref={blokRef}>
            <div className="blok__main">
              <div className="blok__head">
                <span className="blok__type">Example</span>
                <span className="blok__id">B3</span>
                <span className={cx(s.attrCause, "mono")}>Likely cause · 82% · Gemini</span>
              </div>
              <p className="blok__text">“I’ve issued a full refund, sorry for the trouble.”</p>
            </div>
          </div>
          <svg className={s.attrWire} aria-hidden="true" ref={wireRef}>
            <path ref={pathRef} d="M0 0" style={{ strokeDasharray: 2000, strokeDashoffset: 2000 }} />
          </svg>
        </div>
      </RevealedProvider>
    </article>
  );
}
