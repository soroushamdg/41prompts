import path from "node:path";
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@41prompts/ui", "@41prompts/db", "@41prompts/logger"],
  turbopack: {
    root: path.join(import.meta.dirname, "..", ".."),
    // `@41prompts/core` is consumed as its **built** output here, and only here.
    //
    // core is `moduleResolution: NodeNext`, so its own relative imports carry the `.js` extension
    // TypeScript requires (`export * from "./budgets.js"`) while the files on disk are `.ts`.
    // Vitest and tsc both map that; Turbopack does not, and the failure is a 500 on the route
    // ("Can't resolve './budgets.js'") rather than a type error — found by loading the page.
    // Measured, not assumed: `transpilePackages`, `experimental.extensionAlias` (a webpack-only
    // option, accepted by the schema and inert here) and aliasing to core's *source* were each
    // tried and each failed the same way.
    //
    // The alternatives were worse. Dropping the `.js` extensions would break the NodeNext
    // resolution the published package exists to support — core is imported by Node consumers, not
    // only by bundlers. Repointing core's `main` at `dist` would redesign a public package's entry
    // points inside a web epic, which is EPIC-052's job, and would force every test in the
    // monorepo through a build step.
    //
    // So the alias is scoped to this app: tsc and vitest keep resolving core's source through its
    // unchanged `main`, and only the bundler reads `dist`. `turbo run build` builds core first
    // (`dependsOn: ["^build"]`, and apps/web now declares the workspace dependency), and `predev`
    // does the same for `next dev`, so the served code can never be older than the source.
    //
    // The path is relative to **this app's directory**, not to `root` above. Established by trying
    // both: `"packages/core/dist/index.js"` and `"./packages/..."` are silently ignored — no error,
    // the import just falls back to the source and fails on the next `.js` — while an absolute path
    // is read as relative and produces `Can't resolve './Users/...'`. Only this form resolves.
    resolveAlias: {
      "@41prompts/core": "../../packages/core/dist/index.js"
    }
  },
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
