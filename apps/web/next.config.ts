import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@41prompts/ui", "@41prompts/core", "@41prompts/db"],
  // The dev-mode route indicator renders on top of page content (visible in /dev/ui's own
  // visual-regression snapshots) and never appears in a production build; real compile/runtime
  // errors still surface without it.
  devIndicators: false
};

export default nextConfig;
