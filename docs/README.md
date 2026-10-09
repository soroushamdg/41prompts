# 41prompts · docs

The design reference for rebuilding 41prompts: a working HTML mockup in the Blueprint style, every asset it uses, and the specs behind it. Use this folder as the source of truth when building the product (including with Claude Code).

## Open it

Open `mockup/index.html` in a browser. It is the drawing set: every screen, grouped by domain, with screenshots. Everything works offline: fonts, icons and scripts are local, with no dependencies.

## What's here

```
docs/
├── README.md           this file
├── FEATURES.md         final feature list: Kano category, plan, expected behaviour
├── DESIGN.md           the design spec: tokens, type, components, motion, cursors, routes
├── mockup/
│   ├── index.html                  drawing set (start here)
│   ├── 41prompts.ai/index.html     landing page
│   └── app.41prompts.ai/           sign-in, library, new, editor, settings
└── assets/
    ├── tokens.json                 design tokens as data
    ├── css/                        tokens, components, motion, landing, app
    ├── js/                         motion primitives, UI behaviour, icon sprite, page scripts
    ├── logo/                       logo.js (the live hover morph), mark SVGs, lockup, morph data
    ├── cursors/                    5 custom cursors (hotspots in DESIGN.md)
    ├── icons/                      38 stroke icons, 24×24
    ├── fonts/                      Archivo, IBM Plex Sans, Martian Mono (OFL)
    └── screenshots/                1440×900 render of every sheet
```

## Plans

- **Free:** every must-be feature, unlimited.
- **Performance:** every performance feature and delighter, billed through Stripe.

IDs (M01–M10, P01–P08, D01–D05, B01) are listed in FEATURES.md and used across the mockup.

## Building from this

1. **Stack.** The live site is Next.js. Either run one Next.js app with host-based routing (`41prompts.ai` serves the marketing routes, `app.41prompts.ai` serves the app routes), or run two apps that share a design package. Scope the auth cookie to `app.41prompts.ai`.
2. **Tokens first.** Port `assets/css/tokens.css` as CSS variables (or a Tailwind theme generated from `assets/tokens.json`). Do not invent new colors.
3. **Components next.** Build the components in DESIGN.md §6 as React components with the same class semantics. The logo must keep the exact morph from `assets/logo/logo.js`.
4. **Screens in this order:** sign-in → library → new → editor → settings → landing. These cover every Free feature.
5. **Performance stays locked.** Build each Performance control as a locked stub that opens the upgrade sheet. Enforce the plan on the server from Stripe webhooks.
6. **Motion last.** Follow the catalogue in DESIGN.md §8. Respect reduced motion everywhere.

Precedence when things disagree: DESIGN.md → `assets/` → mockup HTML.

## Not real yet

`[YOUR EMAIL]`, `$TBD`, every example prompt and number, the run reply, Stripe Checkout and export are simulated. The `.mock-tag` label at the corner of each page exists only in the mockup.
