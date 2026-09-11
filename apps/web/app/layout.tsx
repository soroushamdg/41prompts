import { isThemeValue, themeInitScript, THEME_COOKIE_NAME } from "@41prompts/ui";
import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { siteOrigin } from "@/lib/site/url";
import "./globals.css";

/**
 * Site-wide metadata defaults (EPIC-016 decision 9). Each page overrides `title`, `description` and
 * its own canonical; the Open Graph card, the Twitter card and `metadataBase` are set once here so a
 * new route cannot forget them.
 *
 * `metadataBase` is what turns a relative `alternates.canonical` into an absolute URL and what points
 * the card at the generated `opengraph-image`. Without it Next warns and falls back to localhost.
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: {
    default: "41Prompts — see what is actually in your prompt",
    template: "%s"
  },
  description:
    "Paste a prompt and get it back as named bloks, with every rule that nothing checks called out. Free, no account, nothing stored.",
  openGraph: {
    type: "website",
    siteName: "41Prompts",
    locale: "en"
  },
  twitter: {
    card: "summary_large_image"
  }
};

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-sans",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieTheme = (await cookies()).get(THEME_COOKIE_NAME)?.value;
  const theme = isThemeValue(cookieTheme) ? cookieTheme : undefined;

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${archivo.variable} ${plexMono.variable}`}
      // The no-flash script (below) sets `data-theme` on this element before hydration when
      // there's no cookie yet — an intentional, expected mismatch between the server-rendered
      // attribute and the DOM at hydration time, not a real bug. Scoped to this one attribute.
      suppressHydrationWarning
    >
      <body>
        {/* Only runs when there is no theme cookie yet — see theme-script.ts. First child of
            body, synchronous and blocking, so `data-theme` is set before anything paints; no
            flash of the wrong theme. */}
        {!theme && <script dangerouslySetInnerHTML={{ __html: themeInitScript(THEME_COOKIE_NAME) }} />}
        {children}
      </body>
    </html>
  );
}
