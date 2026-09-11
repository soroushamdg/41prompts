import { ImageResponse } from "next/og";

export const alt = "41Prompts — a prompt change ships, nothing checks it, you find out from a user";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The card a link to this page unfurls into.
 *
 * It says the same thing the hero says, because a card that promises something the page does not
 * deliver is the oldest trick on the internet and this reader has seen it. Generated at build time,
 * so it costs the critical path nothing.
 *
 * Colours are the light-theme token literals rather than `var(--color-*)`: this renders through
 * Satori, which has no CSS custom properties and no stylesheet. They are duplicated here and
 * nowhere else — `token-contract.test.ts` guards `packages/ui`, which is where the definitions live.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#efede6",
          color: "#111111",
          padding: 72,
          fontFamily: "sans-serif"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 56,
              height: 56,
              background: "#111111",
              color: "#ffffff",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 30,
              fontWeight: 900
            }}
          >
            41
          </div>
          <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: -1 }}>prompts</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 62, fontWeight: 800, lineHeight: 1.08, letterSpacing: -2, maxWidth: 980 }}>
            A prompt change ships. Nothing checks it. You find out from a user.
          </div>
          <div style={{ fontSize: 27, color: "#4a4740", maxWidth: 900 }}>
            Paste one and get it back as named bloks, with every rule that nothing checks called out.
          </div>
        </div>

        <div style={{ fontSize: 22, color: "#6f6b62" }}>Free · no account · nothing stored</div>
      </div>
    ),
    size
  );
}
