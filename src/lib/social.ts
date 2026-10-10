import type { Metadata } from "next";
import { siteUrl } from "@/lib/hosts";

/* The link preview X, LinkedIn, Slack and the rest show for both hosts. The card
   is public/assets/og.png, rendered from docs/launch/og/og.html. */
export const SOCIAL_TITLE = "41prompts · Split, version and run your prompts";
export const SOCIAL_DESCRIPTION =
  "Paste any prompt, split it into typed bloks, keep every version and run it on your own models. Free and unlimited, no card.";

export function socialMetadata(url: string): Pick<Metadata, "openGraph" | "twitter"> {
  const image = {
    url: siteUrl("/assets/og.png"),
    width: 1200,
    height: 630,
    alt: "41prompts: a prompt split into four typed bloks (context, constraint, example, expects), saved as a version and run on your own key.",
  };
  return {
    openGraph: { type: "website", siteName: "41prompts", url, title: SOCIAL_TITLE, description: SOCIAL_DESCRIPTION, images: [image] },
    twitter: { card: "summary_large_image", title: SOCIAL_TITLE, description: SOCIAL_DESCRIPTION, creator: "@soroucsh", images: [image] },
  };
}
