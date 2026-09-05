import { isThemeValue, themeInitScript, THEME_COOKIE_NAME } from "@41prompts/ui";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";

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
