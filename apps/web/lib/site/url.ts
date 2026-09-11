/**
 * The site's own origin, read at runtime.
 *
 * `BETTER_AUTH_URL` is already "the app's own base URL, read at runtime — never hard-coded"
 * (`.env.example`), set per environment and correct on staging and production alike. Adding a second
 * variable that means the same thing is how two of them end up disagreeing.
 *
 * The fallback is localhost rather than the production hostname on purpose: a canonical URL that
 * silently claims to be `41prompts.ai` from a misconfigured box is worse than an obviously wrong one.
 */
export function siteOrigin(): string {
  const configured = process.env.BETTER_AUTH_URL;
  if (configured !== undefined && configured.length > 0) return configured.replace(/\/+$/, "");
  return "http://localhost:3000";
}
