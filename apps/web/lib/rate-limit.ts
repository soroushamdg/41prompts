/**
 * A fixed-window rate limiter, shared by everything in this app that has to bound a caller.
 *
 * **It lived in `lib/decompile/rate-limit.ts` until EPIC-057**, where it was written for the public
 * decompiler and was never decompile-specific: `checkLimit` is a window store keyed by a string, and
 * only the three constants above it in that file are about decompiling. When `/v1` needed a limit
 * (EPIC-057, the roadmap's *"rate-limited pointer endpoint"*), the choice was to copy it or to move
 * it, and this repository has refused a second copy under five names already — the env placeholders,
 * `buildHashOf`, the publish gate, the bindings generator, and the `.pyi` EPIC-054 declined.
 *
 * Here a copy would be worse than usual: two window stores mean two eviction caps and two
 * `resetLimitsForTest`s, and a suite that clears one while the other keeps counting is a limiter
 * that passes its own tests and leaks across them.
 *
 * **In-memory, per process, and that is a deliberate limit rather than an oversight.** The
 * deployment is one web container (see `infra/docker-compose.staging.yml`), so an in-memory counter
 * *is* the global counter today; the moment there are two, this becomes per-instance and every real
 * limit doubles. That is written here rather than discovered later, and the seam is one function
 * wide so a Postgres- or Redis-backed store slots in without touching a caller.
 *
 * **What that costs `/v1` specifically**, since a second reader now depends on it: a redeploy resets
 * every window, so a caller who was being refused is forgiven by a deploy. For a limit whose purpose
 * is to bound cost and brute force rather than to enforce a quota somebody paid for, that is
 * acceptable — and it is stated in `docs/security/sdk-threat-model.md` rather than assumed.
 *
 * Every limit is a named constant (EPIC-014 decision 5), and exceeding one returns a calm message
 * that names the limit. Never a silent failure, and never a CAPTCHA on a first offence — somebody
 * who pastes four prompts in a minute is interested, not hostile.
 */

export interface Limit {
  readonly max: number;
  readonly windowMs: number;
  readonly name: string;
}

export interface LimitVerdict {
  readonly allowed: boolean;
  /** Seconds until the window resets. Only meaningful when `allowed` is false. */
  readonly retryAfterSeconds: number;
  readonly message?: string;
}

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

/**
 * How many entries the store will hold before it starts evicting.
 *
 * A `Map` keyed by caller is an unbounded allocation driven by strangers — exactly the shape of
 * problem this module exists to prevent, so it would be careless to introduce one here. At the cap
 * the oldest-expiring entries go first; evicting somebody's counter only ever forgives them, never
 * penalises them.
 */
const MAX_TRACKED = 10_000;

function evictIfNeeded(now: number): void {
  if (windows.size < MAX_TRACKED) return;
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
  if (windows.size < MAX_TRACKED) return;
  // Still full of live windows: drop the ones resetting soonest, which are the closest to being
  // forgotten anyway.
  const byReset = [...windows.entries()].sort((left, right) => left[1].resetAt - right[1].resetAt);
  for (const [key] of byReset.slice(0, Math.ceil(MAX_TRACKED / 10))) windows.delete(key);
}

/**
 * Record one attempt against a limit and say whether it is allowed.
 *
 * A `null` bucket — no address, no session, no key — is **not** a free pass: it shares one bucket
 * with every other unidentified caller. The alternative is that anyone who strips a header is
 * unlimited.
 */
export function checkLimit(bucket: string | null, limit: Limit, now: number = Date.now()): LimitVerdict {
  // **`\u0000` as an escape, never a raw NUL byte.** Git treats a file containing one as binary and
  // shows no diff for it, which is how packages/core/src/cluster/cluster.ts went unreviewed for two
  // epics. `pnpm binary-files` caught it there, and caught it **here again in EPIC-057** — moving
  // this module wrote the byte the escape denotes rather than the escape, twice, in this line and in
  // `peekLimit`'s. Both lines behave identically at runtime, which is precisely why nothing else
  // notices.
  //
  // A separator that cannot appear in either half, so ("a b", "c") and ("a", "b c") cannot collide
  // into one bucket and share a limit.
  const key = `${limit.name}\u0000${bucket ?? "anonymous"}`;
  evictIfNeeded(now);

  const existing = windows.get(key);
  if (existing === undefined || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + limit.windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count <= limit.max) return { allowed: true, retryAfterSeconds: 0 };

  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  return {
    allowed: false,
    retryAfterSeconds,
    // Names the limit, says when it lifts, and does not imply wrongdoing. Somebody who hits this is
    // almost always enthusiastic rather than hostile.
    message: `That is the limit for now — ${limit.name}. Try again in ${describeWait(retryAfterSeconds)}.`
  };
}

/**
 * Is this bucket already exhausted? Reads the window; **does not** record an attempt.
 *
 * **It gates nothing, deliberately.** It was written in EPIC-057 to refuse an exhausted address
 * before `/v1` touched the database, and that was removed as a worse defect than the one it
 * prevented — a pre-auth gate sees only an address, so anybody could have filled a customer's
 * shared egress bucket and locked out their whole fleet. `lib/deploy/v1-limits.ts`'s header has the
 * argument and the measurement; ruling 12 is the decision.
 *
 * What it is kept for is a real assertion: a test that wants to prove **which** bucket a request
 * was charged to has to read one without spending it. `v1-limits.test.ts` uses it to show that an
 * authenticated caller consumed the key bucket and left the address bucket untouched — a claim the
 * module's own comments make and which nothing else could check.
 *
 * It does not extend the window: a peek that reset or extended anything would let a caller hold
 * themselves refused, or escape by asking politely.
 */
export function peekLimit(bucket: string | null, limit: Limit, now: number = Date.now()): LimitVerdict {
  const existing = windows.get(`${limit.name}\u0000${bucket ?? "anonymous"}`);
  if (existing === undefined || existing.resetAt <= now || existing.count <= limit.max) {
    return { allowed: true, retryAfterSeconds: 0 };
  }
  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  return {
    allowed: false,
    retryAfterSeconds,
    message: `That is the limit for now — ${limit.name}. Try again in ${describeWait(retryAfterSeconds)}.`
  };
}

function describeWait(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return minutes === 1 ? "a minute" : `${minutes} minutes`;
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? "an hour" : `${hours} hours`;
}

/** Clear every window. Tests only. */
export function resetLimitsForTest(): void {
  windows.clear();
}
