import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@41prompts/ui", "@41prompts/core", "@41prompts/db", "@41prompts/logger"],
  // The dev-mode route indicator renders on top of page content (visible in /dev/ui's own
  // visual-regression snapshots) and never appears in a production build; real compile/runtime
  // errors still surface without it.
  devIndicators: false
};

// Uploads source maps from the CI build so a Sentry stack trace is readable (EPIC-004's own
// note: the auth token is never in the repo, only a GitHub Actions secret — infra/ACCESS.md rule
// 7's spirit applied to this token too). `org`/`project` are plain config, not secret; with no
// `SENTRY_AUTH_TOKEN` (local dev, CI without the secret) the plugin skips the upload step
// entirely rather than failing the build — confirmed by a real `next build` with it unset. This
// project builds with Turbopack (confirmed by a real `next build` run), which doesn't support
// every legacy webpack-only option the wrapper still accepts (`disableLogger`,
// `automaticVercelMonitors`) — left out rather than set-and-ignored.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT_WEB,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true
});
