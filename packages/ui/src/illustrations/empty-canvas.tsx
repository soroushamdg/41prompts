/** Empty states only (README rule) — never on a surface showing live data. */
export function EmptyCanvasIllustration() {
  return (
    <svg viewBox="0 0 200 140" className="ill" role="img" aria-label="Empty canvas with a dashed slot">
      <rect x="14" y="16" width="82" height="26" className="fillsurface" />
      <line x1="14" y1="16" x2="14" y2="42" strokeWidth="5" />
      <rect x="14" y="52" width="82" height="26" className="fillsurface" />
      <line x1="14" y1="52" x2="14" y2="78" strokeWidth="5" />
      <rect x="14" y="88" width="82" height="34" className="dash dim fillsunk" />
      <path d="M47 105h16M55 97v16" className="dim" />
      <path d="M110 44h34M110 66h34M110 88h20" className="dim thin" />
      <rect x="106" y="20" width="80" height="100" className="dim dash" />
    </svg>
  );
}
