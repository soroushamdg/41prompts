import type { Metadata, Viewport } from "next";
import { HeadFlags } from "@/components/head-flags";
import { IconSprite } from "@/components/icon";
import { siteUrl } from "@/lib/hosts";
import { fontVariables } from "@/styles/fonts";
import "@/styles/globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl("/")),
  title: "41prompts · Stop guessing which prompt works",
  description: "The workbench for the prompt layer. Break any prompt into bloks, keep every version, and find the blok that broke it.",
  icons: { icon: "/favicon.svg" },
  openGraph: { type: "website", siteName: "41prompts", url: siteUrl("/"), images: [{ url: siteUrl("/assets/og.png"), width: 1200, height: 630, alt: "41prompts: stop guessing which prompt works." }] }, twitter: { card: "summary_large_image", images: [siteUrl("/assets/og.png")] },
};

export const viewport: Viewport = { themeColor: "#0A1830", colorScheme: "dark", viewportFit: "cover" };

export default function SiteRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <head>
        <HeadFlags />
      </head>
      <body>
        <IconSprite />
        {children}
      </body>
    </html>
  );
}
