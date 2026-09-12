import { headers } from "next/headers";

/**
 * The site's own public origin — the apex, and the only host that appears in a canonical URL, a
 * sitemap entry or `llms.txt`.
 *
 * **`PUBLIC_SITE_URL` first.** With two hosts serving one deployment, "our URL" stopped being a
 * single obvious value: `BETTER_AUTH_URL` is now the `app.` host, which is exactly the host that must
 * never appear in a canonical. So the marketing origin is configured on its own.
 *
 * **The request's own host as the fallback**, not a hard-coded production hostname. Local development
 * and any preview host then describe themselves correctly, and a misconfigured box advertises an
 * obviously wrong URL rather than quietly claiming to be `41prompts.ai`.
 */
function normalise(value: string | undefined): string | undefined {
  if (value === undefined || value.length === 0) return undefined;
  return value.replace(/\/+$/, "");
}

export async function siteOrigin(): Promise<string> {
  const configured = normalise(process.env.PUBLIC_SITE_URL);
  if (configured !== undefined) return configured;

  const header = await headers();
  const host = header.get("host");
  if (host !== null && host.length > 0) {
    // Behind the proxy the scheme is only knowable from the forwarded header; locally it is http.
    const forwarded = header.get("x-forwarded-proto");
    const protocol = forwarded ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
    return `${protocol}://${host}`;
  }

  return "http://localhost:3000";
}

/** The host behind a session: `/app/*`, sign-in, sign-up and the auth API. */
export function appOrigin(): string {
  return normalise(process.env.BETTER_AUTH_URL) ?? "http://localhost:3000";
}
