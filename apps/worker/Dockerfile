# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.10.12 prune @41prompts/worker --docker

FROM base AS builder
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
# turbo prune's --docker output only follows the workspace dependency graph; it doesn't
# know about tsconfig.json's plain-file `extends`, so the root tsconfig every package
# extends has to be copied in separately or the TypeScript build fails with TS5083.
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json
RUN pnpm turbo run build --filter=@41prompts/worker

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder --chown=node:node /app .
USER node
# Process-liveness, not application-liveness: worker has no HTTP port to probe. Alpine's
# busybox ships pgrep, so no extra package is needed.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD pgrep -f "apps/worker/dist/index.js" || exit 1
CMD ["node", "apps/worker/dist/index.js"]
