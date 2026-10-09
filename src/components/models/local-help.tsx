"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { addressSpace, blockedHere, detectBrowser, localPermissionDenied } from "@/lib/browser-run";
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
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    let live = true;
    void localPermissionDenied(baseURL).then((d) => live && setDenied(d));
    return () => {
      live = false;
    };
  }, [baseURL]);
  const space = addressSpace(baseURL);
  const lan = space === "local";
  const https = baseURL.startsWith("https:");
  const blocked = me ? blockedHere(baseURL) : null;
  return (
    <details className={s.trouble} open={open}>
      <summary>How to fix it</summary>
      <div>
        {blocked && <p className={s.warn}>{blocked}</p>}
        {denied && (
          <p className={s.warn}>
            This browser is set to block this site from {lan ? "your local network" : "apps on this device"}. Allow it again in the site settings, from the icon next to the address bar.
          </p>
        )}
        <p>The request goes from this tab straight to {baseURL || "your server"}. If the server is running, it has to allow this site, {origin}, to call it.</p>
        {provider === "ollama" ? (
          <ol>
            <li>
              Ollama only allows its own apps and localhost pages by default. Set <b>OLLAMA_ORIGINS</b> to this site, then quit and reopen Ollama.
              <pre>{`# macOS (set it again after a restart of the Mac)\nlaunchctl setenv OLLAMA_ORIGINS "${origin}"\n\n# Linux: sudo systemctl edit ollama.service\n[Service]\nEnvironment="OLLAMA_ORIGINS=${origin}"${lan ? '\nEnvironment="OLLAMA_HOST=0.0.0.0:11434"' : ""}\n# then: sudo systemctl daemon-reload && sudo systemctl restart ollama\n\n# Windows: quit Ollama, then add a user environment variable\nOLLAMA_ORIGINS = ${origin}`}</pre>
            </li>
            {lan && (
              <li>
                On the other machine, also set <b>OLLAMA_HOST</b> to <code>0.0.0.0:11434</code> so Ollama listens on your network.
              </li>
            )}
            {https && (
              <li>Behind an HTTPS proxy such as Tailscale Serve or Caddy, Ollama refuses unknown host names. Have the proxy send Host: localhost, or set OLLAMA_HOST to 0.0.0.0.</li>
            )}
          </ol>
        ) : provider === "lmstudio" ? (
          <ol>
            <li>In LM Studio, open the Developer tab and start the server.</li>
            <li>In Server Settings, turn on <b>Enable CORS</b>{lan ? <> and <b>Serve on Local Network</b></> : null}.</li>
            <li>Enable CORS lets websites call LM Studio, so also turn on <b>Require Authentication</b>, create a token under Manage Tokens, and paste it in the API key field here.</li>
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
        {space && (me === "chrome" || me === "firefox" || me === null) && (
          <p>
            Chrome, Edge and Firefox ask once before this site can reach {lan ? "your local network" : "apps on this device"}. Choose Allow.
            {lan ? " On a Mac, the browser also needs Local Network access in System Settings › Privacy & Security." : ""}
          </p>
        )}
      </div>
    </details>
  );
}
