"use client";

import { Button, Input } from "@41prompts/ui";
import Script from "next/script";
import { useActionState, useEffect, useRef, useState } from "react";
import { RETENTION_SENTENCE, SHARE_INITIAL, WAITLIST_INITIAL } from "@/lib/decompile/share-state";
import { joinWaitlist, shareDecompile } from "./share-actions";

/**
 * Share, and the waitlist, at the foot of a result.
 *
 * **The retention sentence is above the share control, not below it** (acceptance criterion). Telling
 * somebody what happens to their prompt after they have shared it is not informed consent, it is an
 * apology.
 */

export interface SharePanelProps {
  readonly source: string;
  readonly turnstileSiteKey: string | null;
}

export function SharePanel({ source, turnstileSiteKey }: SharePanelProps) {
  const [shareState, shareAction, sharing] = useActionState(shareDecompile, SHARE_INITIAL);
  const [waitlistState, waitlistAction, joining] = useActionState(joinWaitlist, WAITLIST_INITIAL);
  const [copied, setCopied] = useState(false);
  const linkRef = useRef<HTMLInputElement>(null);

  const shareUrl = shareState.status === "shared" ? `${typeof window === "undefined" ? "" : window.location.origin}/d/${shareState.id}` : "";

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2_000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <section className="share-panel" aria-labelledby="share-heading">
      <h2 id="share-heading" className="eyebrow decompile-section-heading">
        Share this
      </h2>

      <div className="share-body">
        <p className="share-retention">{RETENTION_SENTENCE}</p>

        {shareState.status !== "shared" && (
          <form action={shareAction} className="share-form">
            <input type="hidden" name="source" value={source} />
            {/* Turnstile guards this action and nothing else. With no site key the widget is not
                rendered at all and the server skips verification — the rate limit still applies. */}
            {turnstileSiteKey !== null && (
              <>
                <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
                <div className="cf-turnstile" data-sitekey={turnstileSiteKey} data-response-field-name="turnstileToken" />
              </>
            )}
            <Button type="submit" variant="primary" disabled={sharing} data-testid="share">
              {sharing ? "Making a link…" : "Get a shareable link"}
            </Button>
            {shareState.status === "error" && (
              <p className="share-error" role="alert">
                {shareState.message}
              </p>
            )}
          </form>
        )}

        {shareState.status === "shared" && (
          <div className="share-result" data-testid="share-result">
            <label className="eyebrow" htmlFor="share-url">
              Your link
            </label>
            <div className="share-url-row">
              <Input id="share-url" ref={linkRef} readOnly value={shareUrl} data-testid="share-url" />
              <Button
                type="button"
                onClick={async () => {
                  // `navigator.clipboard` is unavailable outside a secure context and can be refused
                  // by permission, so selecting the field is the fallback: the reader can always copy
                  // it themselves, and a button that silently does nothing would be worse than one
                  // that hands them a selected field.
                  try {
                    await navigator.clipboard.writeText(shareUrl);
                    setCopied(true);
                  } catch {
                    linkRef.current?.select();
                  }
                }}
              >
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="share-note" aria-live="polite">
              Anyone with this link can read the prompt — and delete it, from the page.
            </p>
          </div>
        )}
      </div>

      <div className="waitlist" data-testid="waitlist">
        <h3 className="waitlist-heading">The editor is coming.</h3>
        <p className="waitlist-body">
          This reads a prompt. The next thing edits one — bloks you change, checks that fail when you
          break something. Leave an email and I will tell you when it ships. Nothing else, ever.
        </p>
        {waitlistState.status === "joined" ? (
          <p className="waitlist-joined" role="status">
            You are on the list. You can unsubscribe from any email I send.
          </p>
        ) : (
          <form action={waitlistAction} className="waitlist-form">
            <label className="sr-only" htmlFor="waitlist-email">
              Your email
            </label>
            <Input
              id="waitlist-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
            <Button type="submit" disabled={joining}>
              {joining ? "Adding…" : "Tell me when it ships"}
            </Button>
            {waitlistState.status === "error" && (
              <p className="share-error" role="alert">
                {waitlistState.message}
              </p>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
