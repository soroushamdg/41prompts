# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.10.12 prune @41prompts/worker --docker

FROM base AS runner
ENV NODE_ENV=production
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
USER node
# Runs straight from TypeScript source via tsx's Node loader, not a tsc build: @41prompts/db
# (a workspace dependency with no bundler of its own, unlike apps/web which gets Next's
# transpilePackages) has no runtime-resolvable dist output, and plain `tsc` output would leave
# `import ... from "@41prompts/db"` unresolved at `node dist/index.js` time (its package.json
# `main` points at its own .ts source, which is fine for tsx/Next but not for plain node).
# Running the worker itself the same way sidesteps that rather than adding a bundler for one
# entry file (EPIC-002; see the report for the alternatives considered).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD pgrep -f "apps/worker/src/index.ts" || exit 1
CMD ["node", "--import", "tsx/esm", "apps/worker/src/index.ts"]
