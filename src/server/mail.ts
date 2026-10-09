import { appendFileSync, mkdirSync } from "node:fs";
import { isE2E } from "@/lib/env";

/* Outgoing email. Resend in every real environment; under E2E_MODE the
   message is appended to .e2e/outbox.jsonl for Playwright to read. Locally,
   without a Resend key, the message is printed (never in production). */

export type Mail = { to: string; subject: string; text: string; html: string; tag: string };

export const OUTBOX = ".e2e/outbox.jsonl";

export async function sendMail(mail: Mail): Promise<void> {
  if (isE2E()) {
    mkdirSync(".e2e", { recursive: true });
    appendFileSync(OUTBOX, JSON.stringify({ ...mail, at: new Date().toISOString() }) + "\n");
    return;
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.VERCEL_ENV) throw new Error("RESEND_API_KEY is not set.");
    console.info(`[mail] to ${mail.to}: ${mail.subject}\n${mail.text}`);
    return;
  }
  const { Resend } = await import("resend");
  const resend = new Resend(key);
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error("EMAIL_FROM is not set.");
  const { error } = await resend.emails.send({ from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html, tags: [{ name: "kind", value: mail.tag }] });
  if (error) throw new Error(`Resend refused the email: ${error.name}`);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The sign-in email. Plain words, one button, works once, 15 minutes. */
export function signInMail(to: string, link: string): Mail {
  const text = [
    "Use this link to sign in to 41prompts:",
    "",
    link,
    "",
    "It works once and expires in 15 minutes. If you did not ask for it, you can ignore this email.",
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#0A1830;padding:32px 16px;font-family:'IBM Plex Sans',system-ui,-apple-system,'Segoe UI',sans-serif;color:#E9F1FF">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:480px;border:1px solid rgba(156,195,255,.28);background:#0C1C38" cellspacing="0" cellpadding="0"><tr><td style="padding:28px">
<p style="margin:0 0 6px;font-family:Menlo,Consolas,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#93A9CB">41prompts · Sign in</p>
<h1 style="margin:0 0 14px;font-size:24px;line-height:1.2;color:#E9F1FF">Your sign-in link</h1>
<p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#C9D7EE">It works once and expires in 15 minutes.</p>
<a href="${esc(link)}" style="display:inline-block;background:#E9F1FF;color:#0A1830;text-decoration:none;font-weight:600;font-size:15px;padding:13px 20px;border-radius:7px">Sign in to 41prompts</a>
<p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#93A9CB">If you did not ask for this, you can ignore this email. Nobody can sign in without the link.</p>
</td></tr></table></td></tr></table></body></html>`;
  return { to, subject: "Your 41prompts sign-in link", text, html, tag: "sign-in" };
}
