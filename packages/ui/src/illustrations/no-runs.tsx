export function NoRunsIllustration() {
  return (
    <svg viewBox="0 0 200 140" className="ill" role="img" aria-label="Three empty provider columns">
      <line x1="16" y1="112" x2="184" y2="112" strokeWidth="2.5" />
      <rect x="30" y="60" width="34" height="52" className="dash dim fillsunk" />
      <rect x="84" y="60" width="34" height="52" className="dash dim fillsunk" />
      <rect x="138" y="60" width="34" height="52" className="dash dim fillsunk" />
      <circle cx="47" cy="34" r="7" className="dim" />
      <circle cx="101" cy="34" r="7" className="dim" />
      <circle cx="155" cy="34" r="7" className="dim" />
      <path d="M47 41v19M101 41v19M155 41v19" className="dim thin dash" />
    </svg>
  );
}
