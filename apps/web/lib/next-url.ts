// Where sign-in lands. **Must be a page a user can work from** — it was `/app` until 2026-09-14,
// a stub with no project list and no link to one, so everyone who signed in was stranded there.
export const DEFAULT_NEXT_PATH = "/app/projects";

// Only a same-origin relative path is ever returned. An open redirect here would let
// `/sign-in?next=<attacker-controlled>` bounce a signed-in user anywhere after sign-in — the
// classic phishing hole (EPIC-002 decision 6). Rejects absolute URLs, protocol-relative
// (`//host`), and the backslash/control-character variants some browsers still normalize to
// a protocol-relative URL before navigating.
export function safeNextPath(candidate: string | null | undefined, fallback = DEFAULT_NEXT_PATH): string {
  if (typeof candidate !== "string" || candidate.length === 0) {
    return fallback;
  }
  if (candidate[0] !== "/" || candidate[1] === "/" || candidate[1] === "\\") {
    return fallback;
  }

  try {
    const base = "http://localhost";
    const resolved = new URL(candidate, base);
    if (resolved.origin !== base) {
      return fallback;
    }
  } catch {
    return fallback;
  }

  return candidate;
}
