import { Resend } from "resend";

// Resend's shared sandbox sender, until 41prompts.ai is verified in Resend (infra/README.md's
// "Auth secrets" section) — Resend only lets this address send to the account's own verified
// email, not arbitrary recipients, so this is a placeholder for real magic-link delivery, not a
// long-term choice.
const MAGIC_LINK_FROM = "41Prompts <onboarding@resend.dev>";

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
    from: MAGIC_LINK_FROM,
    to: email,
    subject: "Sign in to 41Prompts",
    text: `Sign in by opening this link within 15 minutes:\n\n${url}\n\nIf you didn't request this, ignore this email.`,
  });
}
