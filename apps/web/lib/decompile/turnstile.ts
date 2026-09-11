/**
 * Cloudflare Turnstile, on permalink creation only.
 *
 * **Not on decompiling** (EPIC-014 decision 6). Making someone prove they are human before they have
 * seen any value is how the funnel dies, and the funnel is half of M1's kill criterion. Sharing is
 * the right place for it: by then the reader has had the thing they came for, and the action writes a
 * row that lives for thirty days.
 *
 * **Unconfigured is a working state, not a broken one.** The keys are a human setup step and this
 * epic is built and tested without them. With no keys the widget is not rendered and verification is
 * skipped — the rate limits still apply, so the path is guarded, just not by this.
 *
 * **There is no half-configured state.** Turnstile needs two variables that a person types by hand
 * into a deployment dashboard, and setting one of them is the likeliest way to get this wrong. That
 * mistake used to be silent and total: with the secret set and the site key missing, the widget was
 * never rendered, so no token was ever sent, so *every* share was refused — and the message blamed
 * the reader for a challenge they were never shown. It happened on staging on 2026-09-11, which is
 * why this is here. Both keys or neither: one missing key degrades to the documented unconfigured
 * state, which still has the rate limits, and shouts about it in the logs.
 */

const SITE_KEY_ENV = "NEXT_PUBLIC_TURNSTILE_SITE_KEY";
const SECRET_KEY_ENV = "TURNSTILE_SECRET_KEY";
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function env(name: string): string | null {
  const value = process.env[name];
  return value !== undefined && value.length > 0 ? value : null;
}

/**
 * Complained about once per process, not once per share.
 *
 * `error` rather than `warn` — unlike a missing salt, which degrades something invisible, this is a
 * deployment that believes it has a CAPTCHA and does not. That belongs at the level somebody has an
 * alert on.
 */
let complained = false;

function complainIfHalfConfigured(secret: string | null, siteKey: string | null): void {
  if (complained || (secret === null) === (siteKey === null)) return;
  complained = true;
  if (process.env.NODE_ENV === "test") return;
  const missing = secret === null ? SECRET_KEY_ENV : SITE_KEY_ENV;
  console.error(
    `[turnstile] ${missing} is not set while the other key is. Turnstile is OFF and sharing is ` +
      `guarded by the rate limits alone. Set both variables or neither.`
  );
}

/** Reset the one-shot complaint. Tests only. */
export function resetTurnstileWarningForTest(): void {
  complained = false;
}

/**
 * The key the widget renders with, or `null` for "render no widget".
 *
 * Deliberately `null` when the secret is missing too. A challenge nobody verifies is worse than no
 * challenge: it costs the reader a puzzle and buys nothing, and it makes a screenshot of the page
 * look like evidence of a protection that is not running.
 */
export function turnstileSiteKey(): string | null {
  return turnstileConfigured() ? env(SITE_KEY_ENV) : null;
}

/** Both keys, or this is off. See the half-configured note above. */
export function turnstileConfigured(): boolean {
  const secret = env(SECRET_KEY_ENV);
  const siteKey = env(SITE_KEY_ENV);
  complainIfHalfConfigured(secret, siteKey);
  return secret !== null && siteKey !== null;
}

export type TurnstileResult =
  | { readonly ok: true; readonly checked: boolean }
  | { readonly ok: false; readonly message: string };

/** The message a person sees. Never blames them; a failed challenge is usually a stale token. */
const FAILED_MESSAGE = "That check expired before the link was made. Try sharing again.";

export interface VerifyOptions {
  readonly token: string | null | undefined;
  readonly remoteIp?: string | null;
  /** Injected in tests. Defaults to the real endpoint. */
  readonly fetchImpl?: typeof fetch;
  readonly onSkipped?: () => void;
}

export async function verifyTurnstile({
  token,
  remoteIp,
  fetchImpl = fetch,
  onSkipped
}: VerifyOptions): Promise<TurnstileResult> {
  if (!turnstileConfigured()) {
    onSkipped?.();
    // `checked: false` so a caller can log the difference between "a human passed" and "nobody
    // asked". Reporting this as a pass with no distinction is how an unconfigured deployment comes
    // to look protected in a dashboard.
    return { ok: true, checked: false };
  }

  if (token === null || token === undefined || token.length === 0) {
    return { ok: false, message: FAILED_MESSAGE };
  }

  const body = new URLSearchParams({ secret: env(SECRET_KEY_ENV) ?? "", response: token });
  if (remoteIp !== null && remoteIp !== undefined && remoteIp.length > 0) body.set("remoteip", remoteIp);

  try {
    const response = await fetchImpl(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body
    });
    const verdict = (await response.json()) as { success?: boolean };
    if (verdict.success === true) return { ok: true, checked: true };
    return { ok: false, message: FAILED_MESSAGE };
  } catch {
    // **Cloudflare being unreachable must not take sharing down.** This endpoint is a dependency we
    // do not control on a path whose failure mode is "a person cannot share a link", and the rate
    // limits already bound what an unchecked caller can do. Failing open here is a deliberate trade,
    // not an oversight: a hard failure would turn their outage into ours.
    return { ok: true, checked: false };
  }
}
