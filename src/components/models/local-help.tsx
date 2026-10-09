"use client";
import { useSyncExternalStore } from "react";
import { blockedHere, detectBrowser } from "@/lib/browser-run";
import { BROWSER_NAME, browserReach } from "@/lib/catalog";
import s from "./models.module.css";

/* Models on the user's own computer or network run from their browser, so
   which browser they use matters (M07). This says which ones can reach the
   address, and how to let the server answer this site. */

const noop = () => () => {};
const useBrowser = () => useSyncExternalStore(noop, detectBrowser, () => null);
const useOrigin = () => useSyncExternalStore(noop, () => window.location.origin, () => "https://app.41prompts.ai");

/** "Works in: Chrome and Edge ✓ · Firefox ✓ · Safari ✕" for one address. */
export function WorksIn({ baseURL }: { baseURL: string }) {
  const me = useBrowser();
  const reach = browserReach(baseURL);
  if (!reach.length) return null;
  const warn = me ? blockedHere(baseURL) : null;
  return (
    <>
      <div className={s.works} role="group" aria-label="Browsers that can reach this address">
        <b>Works in</b>
        {reach.map((r) => (
          <span key={r.browser} className={s.browser} data-ok={r.ok} data-me={r.browser === me ? "" : undefined} title={r.note}>
            {r.ok ? "✓" : "✕"} {BROWSER_NAME[r.browser]}
            {r.browser === me && <span className="sr-only"> (this browser)</span>}
          </span>
        ))}
      </div>
      {reach.some((r) => r.note) && (
        <p className={s.help}>
          {reach
            .filter((r) => r.note)
            .map((r) => `${BROWSER_NAME[r.browser]} ${r.note}`)
            .join(". ")}
          .
        </p>
      )}
      {warn && <p className={s.warn} role="status">{warn}</p>}
    </>
  );
}

/** Steps for letting a local server answer this site. */
export function Troubleshoot({ provider, baseURL, open }: { provider: string; baseURL: string; open?: boolean }) {
  const origin = useOrigin();
  const me = useBrowser();
  let lan = false;
  try {
    const h = new URL(baseURL).hostname;
    lan = !(h === "localhost" || h.endsWith(".localhost") || h.startsWith("127.") || h === "[::1]");
  } catch {
    lan = false;
  }
  return (
    <details className={s.trouble} open={open}>
      <summary>Your browser could not reach the server. How to fix it</summary>
      <div>
        <p>The request goes from this tab straight to {baseURL || "your server"}. If the server is running, it has to allow this site, {origin}, to call it.</p>
        {provider === "ollama" ? (
          <ol>
            <li>
              Set <b>OLLAMA_ORIGINS</b> to this site, then quit and reopen Ollama.
              <pre>{`# macOS\nlaunchctl setenv OLLAMA_ORIGINS "${origin}"\n\n# Linux (systemd): sudo systemctl edit ollama.service\n[Service]\nEnvironment="OLLAMA_ORIGINS=${origin}"\n# then: sudo systemctl restart ollama\n\n# Windows: Settings › Edit environment variables for your account\nOLLAMA_ORIGINS = ${origin}`}</pre>
            </li>
            {lan && (
              <li>
                On the other machine, also set <b>OLLAMA_HOST</b> to <code>0.0.0.0</code> so Ollama listens on your network.
              </li>
            )}
          </ol>
        ) : provider === "lmstudio" ? (
          <ol>
            <li>In LM Studio, open the Developer tab and start the server.</li>
            <li>In Server Settings, turn on <b>Enable CORS</b>{lan ? <> and <b>Serve on Local Network</b></> : null}.</li>
            <li>
              Enable CORS lets any website call LM Studio, so also turn on <b>Require Authentication</b>, create a token, and paste it in the API key field here.
            </li>
          </ol>
        ) : (
          <ul>
            <li>
              The server has to answer CORS requests from <b>{origin}</b> and allow the <b>Authorization</b> and <b>Content-Type</b> headers. For vLLM:
              <pre>{`vllm serve <model> --allowed-origins '["${origin}"]' \\\n  --allowed-headers '["authorization","content-type"]'`}</pre>
            </li>
            <li>Check that the address ends where the server&apos;s /chat/completions begins, usually in /v1.</li>
          </ul>
        )}
        <p>Never allow every site (*). Any page you visit could then use your model.</p>
        {(me === "chrome" || me === null) && (
          <p>
            Chrome and Edge ask once before this site can reach {lan ? "your local network" : "apps on this device"}. If you blocked it, allow it again from the site settings next to the address bar.
          </p>
        )}
      </div>
    </details>
  );
}

