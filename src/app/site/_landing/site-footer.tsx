import { Logo } from "@/components/logo";
import { cx } from "@/lib/cx";
import { appUrl } from "@/lib/hosts";
import { FootMark } from "./foot-mark";
import { ProductHuntBadge } from "./product-hunt-badge";
import s from "../landing.module.css";

/* Footer: only real links. Pricing appears with the pricing flag, Contact
   only when a support address is configured. */
export function SiteFooter({ pricing, supportEmail, base = "" }: { pricing: boolean; supportEmail: string; base?: string }) {
  return (
    <footer className={s.siteFoot}>
      <div className={s.wrap}>
        <div className={s.siteFootGrid} data-cols={supportEmail ? 3 : 2}>
          <div className={s.siteFootBrand}>
            <Logo href="/" label="41prompts, home" size={20} />
            <p>The workbench for the prompt layer. Made in Montréal.</p>
            <ProductHuntBadge />
          </div>
          <nav aria-label="Product">
            <h2 className="label">Product</h2>
            <a href={`${base}#how`}>How it works</a>
            {pricing && <a href={`${base}#pricing`}>Pricing</a>}
            <a href={appUrl("/sign-in")}>Sign in</a>
          </nav>
          {supportEmail && (
            <nav aria-label="Company">
              <h2 className="label">Company</h2>
              <a href={`mailto:${supportEmail}`}>Contact</a>
            </nav>
          )}
          <nav aria-label="Legal">
            <h2 className="label">Legal</h2>
            <a href="/terms">Terms</a>
            <a href="/privacy">Privacy</a>
          </nav>
        </div>
        <FootMark />
        <div className={cx(s.siteFootLegal)}>
          <span>© 2026 41prompts</span>
          <span className="titleblock">
            <span>41prompts.ai</span>
            <span>Sheet 00</span>
            <span>Rev 1</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
