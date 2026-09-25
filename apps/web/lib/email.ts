import { Resend } from "resend";

// Resend's shared sandbox sender — it only lets this address send to the account's own verified
// email, not arbitrary recipients, so it's a fallback for local/staging use, not a production
// choice. Production sets RESEND_FROM_ADDRESS in Coolify to the verified mail.41prompts.ai
// sender (infra/README.md's "Auth secrets" section); staging deliberately leaves it unset and
// keeps this default. Never hard-code an address here — that's exactly what broke the two
// environments apart before this env var existed.
const DEFAULT_MAGIC_LINK_FROM = "41Prompts <onboarding@resend.dev>";

// No-op when RESEND_API_KEY is unset (local dev without the secret, and CI): the Playwright
// magic-link test reads the token straight from the database, so no email ever needs to be
// delivered for the suite to pass. Never logs the address or the link — ACCESS.md rule 7 and
// this epic's own "no email in any log line" criterion apply to application logs too, not
// just SSH sessions.
export async function sendMagicLinkEmail(email: string, url: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return;
  }

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: process.env.RESEND_FROM_ADDRESS ?? DEFAULT_MAGIC_LINK_FROM,
    to: email,
    subject: "Sign in to 41Prompts",
    text: `Sign in by opening this link within 15 minutes:\n\n${url}\n\nIf you didn't request this, ignore this email.`,
  });
}

/**
 * A transactional email that is not the magic link (EPIC-070's dunning, today).
 *
 * **The same no-op rule and the same sender**, and both are deliberate rather than copied. A
 * deployment with no `RESEND_API_KEY` sends nothing and says nothing — that is local development,
 * CI, and any self-hosted deployment that has no mail — and a billing email that threw there would
 * turn "no mail configured" into a failed webhook. `sendMagicLinkEmail` has answered that way since
 * EPIC-002 and there is no reason for this one to differ.
 *
 * **It throws when Resend refuses.** `sendMagicLinkEmail` does too, via the SDK; the difference is
 * only that this one's caller catches, because a dunning email that could not be sent must not
 * become a non-2xx that asks Stripe to redeliver an event already recorded as handled.
 *
 * Never logs the address or the body. Neither does the caller — `lib/billing/dunning.ts`.
 */
export async function sendBillingEmail(email: string, subject: string, text: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return;
  }

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: process.env.RESEND_FROM_ADDRESS ?? DEFAULT_MAGIC_LINK_FROM,
    to: email,
    subject,
    text,
  });
}
