import { Icon } from "@/components/icon";
import { cx } from "@/lib/cx";
import { SitePage } from "./_landing/legal-page";
import l from "./legal.module.css";

export default function SiteNotFound() {
  return (
    <SitePage>
      <div className={l.lost}>
        <p className={cx("label", l.eyebrow)}>Not found</p>
        <h1>Nothing here</h1>
        <p>This page does not exist. The link may be old, or the address may have a typo.</p>
        <div className={l.actions}>
          <a className="btn btn--primary btn--go" href="/">
            Back to 41prompts <Icon name="arrow-right" />
          </a>
          <a className="btn" href="/#how">
            See how it works
          </a>
        </div>
        <span className="titleblock">
          <span>41prompts</span>
          <span>Sheet 404</span>
          <span>No such sheet</span>
        </span>
      </div>
    </SitePage>
  );
}
