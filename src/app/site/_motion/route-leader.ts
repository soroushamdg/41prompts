/* BP.route from docs/assets/js/motion.js: a leader line. It leaves the right
   edge of `from`, runs out to a gutter, turns up or down with rounded corners,
   and enters the right edge of `to` (or the left edges with side "left").
   The svg must be absolutely positioned over the container both sit in. */

export type RouteOptions = { side?: "right" | "left"; gutter?: number; pad?: number };

export function routeLeader(svg: SVGSVGElement, path: SVGPathElement, from: Element, to: Element, opts: RouteOptions = {}): { x: number; y: number } {
  const host = (svg.parentElement ?? svg).getBoundingClientRect();
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  svg.setAttribute("viewBox", `0 0 ${host.width} ${host.height}`);
  const side = opts.side ?? "right";
  const pad = opts.pad ?? 4;
  const gutter = opts.gutter ?? 18;
  const y1 = a.top - host.top + a.height / 2;
  const y2 = b.top - host.top + b.height / 2;
  let x1: number;
  let x2: number;
  let gx: number;
  if (side === "right") {
    x1 = a.right - host.left + pad;
    x2 = b.right - host.left + pad;
    gx = Math.min(Math.max(x1, x2) + gutter, host.width - 3);
  } else {
    x1 = a.left - host.left - pad;
    x2 = b.left - host.left - pad;
    gx = Math.max(3, Math.min(x1, x2) - gutter);
  }
  const r = 6;
  const dy = y2 > y1 ? 1 : -1;
  const sx = side === "right" ? 1 : -1;
  const d =
    `M${x1} ${y1} H${gx - sx * r}` +
    ` Q${gx} ${y1} ${gx} ${y1 + dy * r}` +
    ` V${y2 - dy * r}` +
    ` Q${gx} ${y2} ${gx - sx * r} ${y2}` +
    ` H${x2}`;
  path.setAttribute("d", d);
  return { x: x2, y: y2 };
}
