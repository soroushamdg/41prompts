import { ImageResponse } from "next/og";
import { FINDINGS_IN_ORDER } from "@/lib/site/finding-copy";

export const alt = "What your prompt does not check — the six findings, with real examples";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The article's own card, so a link to it unfurls as the article rather than as the home page.
 *
 * The six names come from `FINDING_KINDS` like everything else on the page, so a seventh kind cannot
 * leave the card showing six. Colours are light-theme literals because Satori has no custom
 * properties; see the site-wide `opengraph-image.tsx` for the same note.
 */
export default function ArticleOpengraphImage() {
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
          padding: 68,
          fontFamily: "sans-serif"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 46,
              height: 46,
              background: "#111111",
              color: "#ffffff",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 25,
              fontWeight: 900
            }}
          >
            41
          </div>
          <div style={{ fontSize: 25, fontWeight: 900, letterSpacing: -1 }}>prompts</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 66, fontWeight: 800, lineHeight: 1.06, letterSpacing: -2, maxWidth: 900 }}>
            What your prompt does not check
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, maxWidth: 1040 }}>
            {FINDINGS_IN_ORDER.map(([kind, copy]) => (
              <div
                key={kind}
                style={{
                  border: "2px solid #111111",
                  borderRadius: 4,
                  padding: "7px 14px",
                  fontSize: 22,
                  fontWeight: 700
                }}
              >
                {copy.name}
              </div>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 21, color: "#4a4740" }}>
          Real examples, from the corpus this product is tested against
        </div>
      </div>
    ),
    size
  );
}
