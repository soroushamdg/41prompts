import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./maintenance.css";

/* Its own root layout: while maintenance mode is on, src/proxy.ts rewrites
   every page request on both hosts here, and nothing else loads. */

const Archivo = localFont({
  src: [
    { path: "../../styles/fonts/archivo-latin-800-normal.woff2", weight: "800", style: "normal" },
    { path: "../../styles/fonts/archivo-latin-900-normal.woff2", weight: "900", style: "normal" },
  ],
  variable: "--font-archivo",
  display: "swap",
});

const IBMPlexSans = localFont({
  src: [{ path: "../../styles/fonts/ibm-plex-sans-latin-400-normal.woff2", weight: "400", style: "normal" }],
  variable: "--font-plex",
  display: "swap",
});

const MartianMono = localFont({
  src: [{ path: "../../styles/fonts/martian-mono-latin-400-normal.woff2", weight: "400", style: "normal" }],
  variable: "--font-martian",
  display: "swap",
});

export const metadata: Metadata = {
  title: "41prompts · Under maintenance",
  description:
    "We are rebuilding 41prompts, the workbench for the prompt layer. Break any prompt into bloks, see what each one adds, keep every version. Back soon.",
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }] },
};

export const viewport: Viewport = {
  themeColor: "#0A1830",
  colorScheme: "dark",
};

export default function MaintenanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${Archivo.variable} ${IBMPlexSans.variable} ${MartianMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
