import { cx } from "@/lib/cx";
import { PH_BADGE_ALT, PH_BADGE_SRC, PH_REVIEW_URL } from "../product-hunt";
import s from "../landing.module.css";

/* The Product Hunt review badge with its lead-in line. A plain <img>:
   next/image would proxy the third-party SVG. */
export function ProductHuntBadge({ className }: { className?: string }) {
  return (
    <div className={cx(s.ph, className)}>
      <p className="muted">Using 41prompts? A short review on Product Hunt helps other people find it.</p>
      <a className={s.phLink} href={PH_REVIEW_URL} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={PH_BADGE_SRC} alt={PH_BADGE_ALT} width={250} height={54} style={{ width: 250, height: 54 }} />
      </a>
    </div>
  );
}
