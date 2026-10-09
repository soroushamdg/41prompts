import type { Metadata, Viewport } from "next";
import { Analytics } from "@/components/analytics";
import { HeadFlags } from "@/components/head-flags";
import { IconSprite } from "@/components/icon";
import { MotionProvider } from "@/components/motion-provider";
import { ToastProvider } from "@/components/toast";
import { db } from "@/db";
import { planFor } from "@/server/plan";
import { getSession } from "@/server/session";
import { fontVariables } from "@/styles/fonts";
import "@/styles/globals.css";
import s from "./app.module.css";

export const metadata: Metadata = {
  title: { default: "41prompts", template: "%s · 41prompts" },
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = { themeColor: "#0A1830", colorScheme: "dark", viewportFit: "cover" };

export default async function AppRootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession().catch(() => null);
  const plan = session ? await planFor(db, session.user.id).catch(() => "free" as const) : "free";
  return (
    <html lang="en" className={fontVariables} data-plan={plan} suppressHydrationWarning>
      <head>
        <HeadFlags />
      </head>
      <body className={s.app}>
        <IconSprite />
        <Analytics />
        <MotionProvider>
          <ToastProvider>{children}</ToastProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
