"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { E, G, logoPaths, prefersReducedMotion, type Pt, type Shape } from "./logo-morph";
import s from "./sheet00.module.css";

/* Sheet 00, the construction drawing of the mark, ported from
   docs/assets/js/pages/sign-in.js. The grid draws itself, then the plate, the
   dimension lines and the glyph outlines; the vertex markers appear with their
   coordinates; the plate fills; then 41 ↔ AI morphs every 3.2 s with every
   vertex marked and its coordinates ticking live. The construction is CSS
   (sheet00.module.css), so it plays without JavaScript and reduced motion
   shows the finished drawing. The morph loop pauses offscreen and while the
   tab is hidden. Added for the showcase: each vertex's straight travel line
   (the morph is a vertex-by-vertex lerp), shown while it moves, and a 41 → AI
   scale. The viewBox is cropped to the drawing so it reads larger. */

const MORPH = 900;
const PERIOD = 3200;
const FIRST = 5200;

let minor = "";
let major = "";
for (let u = 0; u <= 64; u += 4) {
  const line = "M" + u + " 0V64M0 " + u + "H64";
  if (u % 16 === 0) major += line;
  else minor += line;
}

/* Vertex sets in drawing order, with four of them labelled. */
const SETS: [string, Shape, Shape, "outer" | "inner"][] = [
  ["four", G.four, G.A, "outer"],
  ["four", G.four, G.A, "inner"],
  ["one", G.one, G.I, "outer"],
];
const LABELLED = new Set(["four-outer-0", "four-outer-2", "four-outer-8", "one-outer-2"]);

type Mark = { from: Pt; to: Pt; labelled: boolean };
const MARKS: Mark[] = SETS.flatMap(([name, from, to, part]) => {
  const a = from[part] ?? [];
  const b = to[part] ?? [];
  return a.map((pt, i) => ({ from: pt, to: b[i] ?? pt, labelled: LABELLED.has(name + "-" + part + "-" + i) }));
});

function at(m: Mark, e: number): [number, number] {
  return [m.from[0] + (m.to[0] - m.from[0]) * e, m.from[1] + (m.to[1] - m.from[1]) * e];
}
function coord(n: number) {
  return n.toFixed(1).replace(".0", "");
}

const REST = logoPaths(0);
const v = (props: Record<string, string | number>) => props as CSSProperties;

export function Sheet00() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const fig = ref.current;
    if (!fig || prefersReducedMotion()) return;
    const left = fig.querySelector<SVGPathElement>("[data-ms-left]");
    const right = fig.querySelector<SVGPathElement>("[data-ms-right]");
    const state = fig.querySelector<HTMLElement>("[data-ms-state]");
    if (!left || !right || !state) return;
    const host = fig;
    const L = left;
    const R = right;
    const label = state;
    const dots = MARKS.map((_, i) => host.querySelector<SVGCircleElement>(`circle[data-vx="${i}"]`));
    const tags = MARKS.map((_, i) => host.querySelector<SVGTextElement>(`text[data-vx="${i}"]`));

    function draw(p: number) {
      const paths = logoPaths(p);
      const e = E(p);
      L.setAttribute("d", paths.left);
      R.setAttribute("d", paths.right);
      MARKS.forEach((m, i) => {
        const [x, y] = at(m, e);
        const c = dots[i];
        const t = tags[i];
        if (c) {
          c.setAttribute("cx", x.toFixed(2));
          c.setAttribute("cy", y.toFixed(2));
        }
        if (t) {
          t.setAttribute("x", (x + 1.4).toFixed(2));
          t.setAttribute("y", (y - 1.2).toFixed(2));
          t.textContent = coord(x) + "," + coord(y);
        }
      });
      host.style.setProperty("--m", e.toFixed(4));
    }

    let p = 0;
    let target = 0;
    let raf = 0;
    let last = 0;
    function step(now: number) {
      if (!last) last = now;
      const dt = Math.min(64, now - last);
      last = now;
      const dir = target > p ? 1 : -1;
      p += (dir * dt) / MORPH;
      if ((dir > 0 && p >= target) || (dir < 0 && p <= target)) {
        p = target;
        raf = 0;
        last = 0;
        draw(p);
        label.textContent = (p ? "AI" : "41") + " · rest";
        delete host.dataset.morph;
        return;
      }
      draw(p);
      label.textContent = "Morph · " + Math.round(E(p) * 100) + "%";
      raf = requestAnimationFrame(step);
    }
    function go(t: number) {
      target = t;
      host.dataset.morph = "";
      if (!raf) raf = requestAnimationFrame(step);
    }

    let visible = true;
    const io =
      "IntersectionObserver" in window
        ? new IntersectionObserver(
            (entries) => {
              visible = entries.some((en) => en.isIntersecting);
            },
            { threshold: 0.15 },
          )
        : null;
    io?.observe(host);

    let timer = window.setTimeout(
      function cycle() {
        if (!document.hidden && visible) go(target ? 0 : 1);
        timer = window.setTimeout(cycle, PERIOD);
      },
      Math.max(400, FIRST - performance.now()),
    );

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      io?.disconnect();
    };
  }, []);

  return (
    <figure className={s.figure} aria-hidden="true" ref={ref}>
      <svg className={s.ms} viewBox="-16 -16 100 84">
        <g className={s.grid}>
          <path className={s.draw} d={minor} pathLength={1} style={v({ "--ms": "1600ms", "--dl": "0ms" })} />
          <path className={`${s.draw} ${s.maj}`} d={major} pathLength={1} style={v({ "--ms": "1600ms", "--dl": "200ms" })} />
        </g>
        <g className={s.dim}>
          <path className={s.draw} pathLength={1} style={v({ "--dl": "900ms", "--ms": "900ms" })} d="M0 -12V-2M64 -12V-2M0 -9H64M-1 -8L1 -10M63 -8L65 -10" />
          <path className={s.draw} pathLength={1} style={v({ "--dl": "1050ms", "--ms": "900ms" })} d="M-12 0H-2M-12 64H-2M-9 0V64M-10 -1L-8 1M-10 63L-8 65" />
          <path className={s.draw} pathLength={1} style={v({ "--dl": "1200ms", "--ms": "900ms" })} d="M50 14H74M50 50H74M72 14V50M71 13L73 15M71 49L73 51" />
          <path className={s.draw} pathLength={1} style={v({ "--dl": "1350ms", "--ms": "700ms" })} d="M60.04 3.96L69 -5H77" />
          <text x="32" y="-11" textAnchor="middle">64</text>
          <text x="-11" y="32" textAnchor="middle" transform="rotate(-90 -11 32)">64</text>
          <text x="73.6" y="33">36</text>
          <text x="77.6" y="-4.4">R5</text>
        </g>
        <rect className={s.plate} pathLength={1} x="2.5" y="2.5" width="59" height="59" rx="5" />
        <path className={s.glyph} data-ms-left="" pathLength={1} style={v({ "--dl": "1500ms", "--ms": "1300ms" })} fillRule="evenodd" d={REST.left} />
        <path className={s.glyph} data-ms-right="" pathLength={1} style={v({ "--dl": "1700ms", "--ms": "1100ms" })} fillRule="evenodd" d={REST.right} />
        <g className={s.tracks}>
          {MARKS.map((m, i) =>
            m.from[0] === m.to[0] && m.from[1] === m.to[1] ? null : (
              <line key={i} x1={m.from[0]} y1={m.from[1]} x2={m.to[0]} y2={m.to[1]} style={v({ "--i": i })} />
            ),
          )}
        </g>
        <g className={s.vx}>
          {MARKS.map((m, i) => {
            const [x, y] = at(m, 0);
            return (
              <g key={i}>
                <circle data-vx={i} r=".85" cx={x.toFixed(2)} cy={y.toFixed(2)} style={v({ "--i": i })} />
                {m.labelled ? (
                  <text data-vx={i} x={(x + 1.4).toFixed(2)} y={(y - 1.2).toFixed(2)} style={v({ "--i": i })}>
                    {coord(x) + "," + coord(y)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </g>
      </svg>
      <div className={s.cap}>
        <span className={s.scale}>
          <span>41</span>
          <span className={s.bar}>
            <i />
          </span>
          <span>AI</span>
        </span>
        <span className={`label ${s.state}`} data-ms-state="">
          41 · rest
        </span>
      </div>
    </figure>
  );
}
