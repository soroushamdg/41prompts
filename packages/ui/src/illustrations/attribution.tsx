/** The signature diagram: one span, one owning blok. Use once, in the failure empty state. */
export function AttributionIllustration() {
  return (
    <svg viewBox="0 0 200 140" className="ill" role="img" aria-label="A highlighted span pointing back to its card">
      <rect x="14" y="14" width="96" height="112" className="fillsurface" />
      <line x1="24" y1="34" x2="100" y2="34" strokeWidth="5" />
      <line x1="24" y1="50" x2="86" y2="50" strokeWidth="5" />
      <rect x="20" y="62" width="86" height="18" className="failf" />
      <line x1="24" y1="94" x2="100" y2="94" strokeWidth="5" />
      <line x1="24" y1="110" x2="76" y2="110" strokeWidth="5" />
      <path d="M108 71h30" className="fail" />
      <path d="M132 65l7 6-7 6" className="fail" />
      <rect x="142" y="56" width="46" height="30" className="failf" />
      <line x1="142" y1="56" x2="142" y2="86" className="fail" strokeWidth="5" />
    </svg>
  );
}
