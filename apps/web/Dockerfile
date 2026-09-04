# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
# `corepack prepare --activate` fetches and activates the pinned pnpm version at build
# time, baked into this layer. Without it, `corepack enable` alone only teaches Node how
# to fetch pnpm on first invocation — meaning the runner stage (which never runs `pnpm`
# itself before the entrypoint does) would hit the network for it on every fresh container
# start, which is both slow and a needless runtime dependency on npm's registry.
#
# COREPACK_HOME is set to a fixed path rather than corepack's default ($HOME/.cache/node/
# corepack): this RUN executes as root (default user here), but the runner stage below
# switches to `USER node`, whose $HOME is /home/node — a different path from root's, so
# the default location would make the runtime user "miss" the cache prepared at build
# time and fall back to a network fetch anyway. A fixed, world-readable path sidesteps
# that user-relative lookup entirely.
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable && corepack prepare pnpm@10.25.0 --activate && chmod -R a+rX /opt/corepack
WORKDIR /app

FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.10.12 prune @41prompts/web --docker

FROM base AS builder
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
# turbo prune's --docker output only follows the workspace dependency graph; it doesn't
# know about tsconfig.json's plain-file `extends`, so the root tsconfig every package
# extends has to be copied in separately or the build fails with TS5083.
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json
ARG COMMIT_SHA=unknown
ENV COMMIT_SHA=$COMMIT_SHA
ENV DEPLOY_ENV=production
RUN pnpm turbo run build --filter=@41prompts/web

# Runner keeps the full pruned workspace, devDependencies included, rather than a slim
# `output: standalone` bundle: the entrypoint below needs the pnpm workspace intact to run
# `pnpm --filter @41prompts/db db:migrate` (drizzle-kit is a devDependency) before `next
# start`. Bigger image, one moving part instead of two — see plan §3.4/§4.0 for the tradeoff.
FROM base AS runner
ENV NODE_ENV=production
ARG COMMIT_SHA=unknown
ENV COMMIT_SHA=$COMMIT_SHA
COPY --from=builder --chown=node:node /app .
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
# Migrations run before the app starts, chained with && so a failed migration (bad SQL,
# unreachable DB) stops the chain before `next start` ever runs — the app never comes up
# against a schema it doesn't match. `exec` on the final step hands off PID 1 to `next
# start` for correct SIGTERM handling from `docker stop`/Coolify.
ENTRYPOINT ["sh", "-c", "echo '[entrypoint] running database migrations' && pnpm --filter @41prompts/db db:migrate && echo '[entrypoint] migrations complete, starting web' && exec pnpm --filter @41prompts/web start"]
