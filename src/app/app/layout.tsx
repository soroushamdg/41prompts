import type { Metadata, Viewport } from "next";
import { HeadFlags } from "@/components/head-flags";
import { IconSprite } from "@/components/icon";
import { ToastProvider } from "@/components/toast";
import { fontVariables } from "@/styles/fonts";
import "@/styles/globals.css";
import s from "./app.module.css";

export const metadata: Metadata = {
  title: { default: "41prompts", template: "%s · 41prompts" },
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = { themeColor: "#0A1830", colorScheme: "dark", viewportFit: "cover" };

export default function AppRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fontVariables} data-plan="free" suppressHydrationWarning>
      <head>
        <HeadFlags />
      </head>
      <body className={s.app}>
        <IconSprite />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
