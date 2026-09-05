const DEFAULT_NEXT_PATH = "/app";

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
