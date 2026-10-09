import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "41prompts · Stop guessing which prompt works",
  description: "The workbench for the prompt layer. Break any prompt into bloks, keep every version, and find the blok that broke it.",
};

export default function SiteRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="landing">{children}</body>
    </html>
  );
}
