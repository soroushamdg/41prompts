# 41prompts

The workbench for the prompt layer. One Next.js app serves two hosts:

- `41prompts.ai`: the landing page (`src/app/site`)
- `app.41prompts.ai`: the app after sign-in (`src/app/app`)

`src/proxy.ts` picks the tree by `Host`. The design reference is in `docs/` (start with `docs/README.md`).

## Local

```sh
pnpm install
cp .env.example .env   # fill in what you need
pnpm dev               # app: http://localhost:3141, site: http://site.localhost:3141
pnpm check             # typecheck, lint, unit tests, build
```

## Maintenance mode

A Vercel production deployment shows the maintenance page on both hosts until
`MAINTENANCE_MODE=0` is set. `MAINTENANCE_MODE=1 pnpm build && MAINTENANCE_MODE=1 pnpm start` shows it locally.

## Deploy (Vercel)

1. Import the GitHub repo into Vercel (framework: Next.js, no build settings to change).
2. Add the domains `41prompts.ai` and `app.41prompts.ai` to the same project.
3. No environment variables are needed while the maintenance page is up.
