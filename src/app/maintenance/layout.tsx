import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "41prompts · Under maintenance",
  description: "41prompts is being rebuilt. The workbench for the prompt layer is back soon.",
};

export default function MaintenanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
