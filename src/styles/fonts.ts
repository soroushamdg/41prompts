import localFont from "next/font/local";

/* Bundled OFL fonts (see src/styles/fonts/LICENSE.md). Each exposes a CSS
   variable that tokens.css folds into --f-display, --f-body and --f-mono. */

export const archivo = localFont({
  variable: "--font-archivo",
  display: "swap",
  src: [
    { path: "./fonts/archivo-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/archivo-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/archivo-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "./fonts/archivo-latin-800-normal.woff2", weight: "800", style: "normal" },
    { path: "./fonts/archivo-latin-900-normal.woff2", weight: "900", style: "normal" },
  ],
});

export const plex = localFont({
  variable: "--font-plex",
  display: "swap",
  src: [
    { path: "./fonts/ibm-plex-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-sans-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ibm-plex-sans-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
});

export const martian = localFont({
  variable: "--font-martian",
  display: "swap",
  src: [
    { path: "./fonts/martian-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/martian-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
  ],
});

export const fontVariables = `${archivo.variable} ${plex.variable} ${martian.variable}`;
