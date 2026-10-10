import type { Metadata, Viewport } from "next";
import { Analytics } from "@/components/analytics";
import { HeadFlags } from "@/components/head-flags";
import { IconSprite } from "@/components/icon";
import { siteUrl } from "@/lib/hosts";
import { SOCIAL_DESCRIPTION, SOCIAL_TITLE, socialMetadata } from "@/lib/social";
import { fontVariables } from "@/styles/fonts";
import "@/styles/globals.css";
import "./site.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl("/")),
  title: SOCIAL_TITLE,
  description: SOCIAL_DESCRIPTION,
  icons: { icon: "/favicon.svg" },
  ...socialMetadata(siteUrl("/")),
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
        <Analytics />
        {children}
      </body>
    </html>
  );
}
