"use client";

import { Button, Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@41prompts/ui";
import { useEffect, useState } from "react";
import { BETA_SEEN_COOKIE_NAME, STAGING_URL, type BetaEnvironment } from "@/lib/site/beta";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export interface BetaNoticeProps {
  readonly environment: BetaEnvironment;
}

/**
 * A thin strip at the top of every page on staging and production, and on production a dialog asked
 * once per browser.
 *
 * **The strip is server-rendered**, so it is there on first paint and never shifts the page after
 * hydration. The dialog is the opposite: it reads a cookie only the client sees, so it mounts, looks,
 * and opens only for somebody who has not dismissed it — the same reasoning as `ConsentBanner`.
 *
 * Deliberately neutral ink, not amber: amber means drift and nothing else (CLAUDE.md rule 10).
 */
export function BetaNotice({ environment }: BetaNoticeProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (environment !== "production") return;
    const seen = document.cookie.split("; ").some((entry) => entry.startsWith(`${BETA_SEEN_COOKIE_NAME}=`));
    if (!seen) setOpen(true);
  }, [environment]);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      document.cookie = `${BETA_SEEN_COOKIE_NAME}=1; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
    }
  }

  return (
    <>
      <section className="beta-strip" aria-labelledby="beta-strip-text">
        <p className="beta-strip-inner" id="beta-strip-text">
          <span className="beta-strip-tag">Beta</span>
          {environment === "production" ? (
            <>
              <span>41Prompts is in beta. You may run into bugs.</span>
              <button type="button" className="beta-strip-more" onClick={() => setOpen(true)}>
                What this means
              </button>
            </>
          ) : (
            <span>This is staging: the newest build, and a beta too. Expect bugs.</span>
          )}
        </p>
      </section>
      {environment === "production" && (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="beta-dialog">
            <div className="sheet-header">
              <DialogTitle className="beta-dialog-title">This is a beta, running in production</DialogTitle>
            </div>
            <div className="sheet-body">
              <DialogDescription className="beta-dialog-body">
                41Prompts is still being built, and you may run into bugs here. If something breaks or
                looks wrong, it is us, not you.
              </DialogDescription>
              <p className="beta-dialog-body">
                For a better experience you can use <a href={STAGING_URL}>staging</a>, which gets every
                fix first. It is a beta too, so expect rough edges there as well.
              </p>
              <DialogClose asChild>
                <Button type="button" size="sm" className="beta-dialog-close">
                  Got it
                </Button>
              </DialogClose>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
