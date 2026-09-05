import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@41prompts/ui", "@41prompts/core", "@41prompts/db"]
};

export default nextConfig;
