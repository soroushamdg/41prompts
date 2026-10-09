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
