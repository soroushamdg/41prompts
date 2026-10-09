import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "41prompts", template: "%s · 41prompts" },
  robots: { index: false, follow: false },
};

export default function AppRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="app">{children}</body>
    </html>
  );
}
