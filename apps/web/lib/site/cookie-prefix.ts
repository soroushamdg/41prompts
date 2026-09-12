/**
 * The session cookie's name prefix, per deployment.
 *
 * ## The bug this exists to make impossible
 *
 * Production sets `SESSION_COOKIE_DOMAIN=.41prompts.ai` so a session made on `app.` is visible on
 * the apex — that is what lets the landing page say "Go to dashboard" without a second round trip,
 * and that domain has to stay wide for it to work.
 *
 * `.41prompts.ai` matches **every** subdomain, `app.staging.41prompts.ai` included. With both
 * deployments using one prefix, both cookies were named `__Secure-41prompts.session_token`, so a
 * browser that had signed into production sent **two cookies of the same name** to staging. Better
 * Auth parses them into a `Map`, one silently wins, and when production's token won, staging looked
 * it up in its own database, found nothing, and bounced to `/sign-in`. Sessions were created
 * correctly every time — four live rows — and vanished on the next request.
 *
 * **The asymmetry is the whole bug.** Staging's cookie is scoped `.staging.41prompts.ai` and cannot
 * reach production, so production only ever sees its own and works fine. Scoping a child domain
 * protects the parent from the child; it does nothing to protect the child from the parent.
 *
 * ## Why a prefix and not a narrower domain
 *
 * Narrowing production's domain is not available — it has to cover the apex and `app.` Different
 * *names* cannot collide whatever the domains are, which makes this fix independent of the topology
 * rather than another thing to keep true as subdomains are added.
 *
 * **Production keeps the bare `41prompts`** so live sessions survive the deploy. Every other
 * deployment gets its environment appended, so anything added under `41prompts.ai` later is safe by
 * construction.
 */
export function sessionCookiePrefix(deployEnv: string | undefined = process.env.DEPLOY_ENV): string {
  const env = deployEnv === undefined || deployEnv.length === 0 ? "development" : deployEnv;
  return env === "production" ? "41prompts" : `41prompts-${env}`;
}
