export function VarianceIllustration() {
  return (
    <svg viewBox="0 0 200 140" className="ill" role="img" aria-label="One prompt producing five different outputs">
      <rect x="10" y="56" width="34" height="28" className="fillsurface" />
      <line x1="10" y1="56" x2="10" y2="84" strokeWidth="5" />
      <path d="M46 70h16" className="dim thin" />
      <path d="M62 70V24h12M62 70V47h12M62 70h12M62 70v23h12M62 70v46h12" className="dim thin" />
      <line x1="78" y1="24" x2="150" y2="24" strokeWidth="5" />
      <line x1="78" y1="47" x2="122" y2="47" strokeWidth="5" />
      <line x1="78" y1="70" x2="164" y2="70" strokeWidth="5" />
      <line x1="78" y1="93" x2="108" y2="93" strokeWidth="5" />
      <line x1="78" y1="116" x2="140" y2="116" className="fail" strokeWidth="5" />
      <rect x="168" y="110" width="14" height="13" className="failf" />
    </svg>
  );
}
