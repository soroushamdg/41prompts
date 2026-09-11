/**
 * Cloudflare Turnstile, on permalink creation only.
 *
 * **Not on decompiling** (EPIC-014 decision 6). Making someone prove they are human before they have
 * seen any value is how the funnel dies, and the funnel is half of M1's kill criterion. Sharing is
 * the right place for it: by then the reader has had the thing they came for, and the action writes a
 * row that lives for thirty days.
 *
 * **Unconfigured is a working state, not a broken one.** The keys are a human setup step and this
 * epic is built and tested without them. With no secret key the widget is not rendered and
 * verification is skipped — the rate limits still apply, so the path is guarded, just not by this.
 * A deployment in that state says so loudly on every check rather than silently accepting anything.
 */

const SITE_KEY_ENV = "NEXT_PUBLIC_TURNSTILE_SITE_KEY";
const SECRET_KEY_ENV = "TURNSTILE_SECRET_KEY";
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function turnstileSiteKey(): string | null {
  const key = process.env[SITE_KEY_ENV];
  return key !== undefined && key.length > 0 ? key : null;
}

export function turnstileConfigured(): boolean {
  const secret = process.env[SECRET_KEY_ENV];
  return secret !== undefined && secret.length > 0;
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

  const body = new URLSearchParams({ secret: process.env[SECRET_KEY_ENV] ?? "", response: token });
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
