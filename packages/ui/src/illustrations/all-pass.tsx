/** "Suite green" — the only place a saturated pass fill is allowed to cover this much area. */
export function AllPassIllustration() {
  return (
    <svg viewBox="0 0 200 140" className="ill" role="img" aria-label="Grid of passing cells with a check">
      <g className="passf">
        <rect x="20" y="30" width="18" height="18" />
        <rect x="44" y="30" width="18" height="18" />
        <rect x="68" y="30" width="18" height="18" />
        <rect x="92" y="30" width="18" height="18" />
        <rect x="116" y="30" width="18" height="18" />
        <rect x="20" y="54" width="18" height="18" />
        <rect x="44" y="54" width="18" height="18" />
        <rect x="68" y="54" width="18" height="18" />
        <rect x="92" y="54" width="18" height="18" />
        <rect x="116" y="54" width="18" height="18" />
        <rect x="20" y="78" width="18" height="18" />
        <rect x="44" y="78" width="18" height="18" />
        <rect x="68" y="78" width="18" height="18" />
        <rect x="92" y="78" width="18" height="18" />
        <rect x="116" y="78" width="18" height="18" />
      </g>
      <circle cx="156" cy="87" r="22" className="passf" />
      <path d="M146 87l7 7 14-15" className="pass" strokeWidth="3" />
    </svg>
  );
}
