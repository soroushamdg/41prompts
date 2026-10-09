# 41prompts · Blueprint design spec

This is the source of truth for building the product from the mockup. Where the two disagree, the order of authority is:

1. This file.
2. `assets/css/*.css` and `assets/tokens.json`.
3. The mockup HTML.

## 1. Direction

**Blueprint:** chalk lines on cyanotype blue. Drafting conventions carry real information in the interface; they are not decoration:

| Drafting device | Used for |
|---|---|
| Sheet numbers (`Sheet A04`) | Screen identity and revision (`Rev 7` = prompt version) |
| Title block (`.titleblock`) | Metadata of a drawing: name, sheet, scale, revision |
| Registration corners (`.frame`) | Panels and bloks. Corner color = blok type |
| Dimension lines (`.dim-label`, `.tick`) | Section labels, the "price set before launch" note |
| Leader lines (`BP.route`) | Failure attribution: a line from the failing check to the blok that caused it |
| Balloons (circled numbers) | Linter findings |
| Bill of materials | The Free plan, with QTY ∞ for unlimited |
| Performance stamp (`.stamp`, ◆) | Anything in the Performance plan |

The editor stays calm. Motion is reserved for moments that explain how the product works.

## 2. Domains and routes

| Mockup file | Route | Notes |
|---|---|---|
| `mockup/41prompts.ai/index.html` | `41prompts.ai/` | Marketing. Sign in and Start free go to the app |
| `mockup/app.41prompts.ai/sign-in.html` | `app.41prompts.ai/sign-in` | `#start` = sign-up heading, `#performance` = Stripe Checkout after sign-in |
| `mockup/app.41prompts.ai/library.html` | `app.41prompts.ai/` | Home after sign-in |
| `mockup/app.41prompts.ai/new.html` | `app.41prompts.ai/new` | |
| `mockup/app.41prompts.ai/editor.html` | `app.41prompts.ai/p/:slug` | |
| `mockup/app.41prompts.ai/settings.html` | `app.41prompts.ai/settings` | Anchors `#keys #billing #data #account` |
| Upgrade sheet (injected by `assets/js/app.js`) | any `[data-perf]` control | A dialog, not a route |

Public share pages (D01) will live on `41prompts.ai/p/:id` so viewers never need the app domain.

## 3. Tokens

Everything is in `assets/css/tokens.css`, mirrored in `assets/tokens.json`. Key values:

| Role | Token | Value |
|---|---|---|
| Page ground | `--bp-ground` | `#0A1830` |
| Panels | `--bp-sheet` | `#0C1C38` |
| Raised | `--bp-raised` | `#132849` |
| Wells (code, inputs) | `--bp-well` | `#081428` |
| Text | `--chalk` / `-2` / `-3` / `-4` | `#E9F1FF` `#C9D7EE` `#93A9CB` (7.3:1) `#7D93B6` (5.6:1) |
| Accent, links, focus | `--accent` | `#9CC3FF` |
| Blok: context / constraint / example / expects | `--blok-*` | `#9CC3FF` `#FFD27A` `#C6A8FF` `#6FE3A5` |
| Pass / fail | `--pass` `--fail` `--fail-text` | `#6FE3A5` `#FF7A66` `#FF9A8A` |
| Performance stamp | `--stamp-bg` / `--stamp-fg` | chalk on ground |

The Performance plan is marked by **form** (a solid chalk stamp with ◆), never by hue. Amber belongs to constraint bloks and variables.

The app is dark-only by design: a blueprint is blue.

## 4. Type

| Role | Family | Weights | Use |
|---|---|---|---|
| Display | Archivo | 700, 800, 900 | Headlines, wordmark, prices. Tight tracking (−0.02 to −0.048em) |
| Body | IBM Plex Sans | 400, 500, 600 | UI and running text. 14px in the app, 16px on the landing page |
| Mono | Martian Mono | 400, 500 | Labels (10.5px, uppercase, +0.08em), IDs, metadata, the compiled prompt |

Fonts are bundled in `assets/fonts` under the OFL. Headings use `text-wrap: balance`.

## 5. Layout

- Background grid: 80px major / 16px minor (`.bp-grid`, `.app-bg`).
- Landing content width: 1240px. App content width: 1180px.
- Side gutter: at least 16px.
- Editor: three flex columns (rail 236–300px, sheet, output 380–480px) that wrap at narrow widths.
- Breakpoints: 1100 (landing grids), 960 (landing stacks), 900 (app stacks), 600/640 (phone).
- Touch targets are at least 36px in dense toolbars and 44px elsewhere.

## 6. Components

All of these are in `assets/css/components.css` unless noted.

| Component | Class | Rules |
|---|---|---|
| Frame | `.frame` (+ `--quiet`, `--chalk`, `--live`) | Four corner marks drawn with gradients. `--corner` sets their color, `--frame-bg` sets the fill. `--live` makes the corners extend from 10px to 22px on hover |
| Title block | `.titleblock` | Mono 9.5px uppercase cells. The first cell is chalk |
| Blok | `.blok[data-type]` | Grip (`.grip`, move cursor), type label in the type color, ID, tools, editable text, variables as `.var`. Expects bloks add `.blok__foot` with the note and the locked "Run as test" button |
| Buttons | `.btn` + `--primary --danger --dashed --locked --bare --sm --lg --icon --block --go` | `--locked` = a Performance control on Free: dashed border plus the stamp. `--go` nudges its arrow on hover |
| Stamp | `.stamp` | ◆ plus uppercase mono on a solid chalk plate |
| Chip | `.chip` (+ `--ok --fail`) | Status pills. As a `<button>` it is a toggle using `aria-pressed` |
| Inputs | `.input`, `.searchbox`, `.field` | Well background; the focus ring is the accent plus a 3px glow |
| Segmented / tabs | `.seg`, `.tabs` + `.tab` | `role="tablist"`; the selected item is chalk-filled (seg) or accent-underlined (tab) |
| Dialog | `dialog.dlg` + `.dlg__panel.frame` | Native `<dialog>`, rises on open. The upgrade sheet stamps its badge in |
| Toast | `.toast` (`BP.toast`) | Bottom centre, one action (Undo) |
| Table | `.table-wrap` + `.table` | Mono uppercase headers, scrolls horizontally inside its wrapper |
| Menu | `details.menu` (`app.css`) | Account menu. Closes on an outside click or Escape |
| Mock tag | `.mock-tag` | **Mockup only. Do not ship.** Shows the route of the current page |

## 7. Plan gating

- The plan lives on `<html data-plan="free|performance">` in the mockup. In the product it comes from the session, set by Stripe webhooks.
- Performance controls are **visible** on Free, marked with the stamp, and open the upgrade sheet (`[data-perf="Feature name"]`). Never hide them: seeing the tool is the upsell.
- Enforce on the server. The UI lock is only a hint.
- Viewing share pages is free for everyone.

## 8. Motion

**Principles**

- Motion explains a mechanism: what splits, what failed, what moved. If an animation does not explain anything, cut it.
- Brand easing is `cubic-bezier(.32,.72,0,1)`, from the live logo. Lines being drawn use `cubic-bezier(.6,0,.2,1)`.
- Everything respects `prefers-reduced-motion`: sequences jump to their end state and loops stop.
- Loops pause when offscreen or when the tab is hidden (`BP.loop`).

**Catalogue**

| Moment | Where | Spec |
|---|---|---|
| Logo morph | Every logo | The 41 vertices interpolate to AI over 500ms (cubic in-out). Plays once on load with a 900ms hold, then follows hover and focus. Past 50% the plate inverts to an outline and the wordmark tracking opens. Data: `assets/logo/logo-morph.json` |
| Grid reveal | Landing hero | A radial mask grows the grid outward from the drawing, 2.4s |
| Title lines | Landing hero | Three lines rise through clip masks, staggered by 90ms |
| CAD crosshair | Landing hero | Dashed guides follow the mouse (lerp 0.28) with an `X 0412  Y 0188` readout. Fine pointers only |
| Sheet 01 | Landing hero | A loop with an 11.8s period. 0.7s: scan line. 2.0s: the paragraph splits into four typed bloks (exploded view, staggered offsets) and conflict warnings appear. 3.9s: runs appear. 4.3s, 4.65s, 5.0s: GPT, Claude and Gemini complete. 6.0s: the leader line routes from the Gemini failure to B3, B3 turns red, and the "Likely cause" callout appears |
| Sheet 02 | How it works | Scroll-driven. Eight text bars morph between three states (paste → four bloks → compiled column), with a dashed connector and a stamp for tests. On phones it cycles every 3.6s |
| Reveal | Sections | Rise 18px and fade, 700–900ms, once |
| BOM | Free plan | Rows cascade every 55ms; each ∞ mark draws itself |
| Attribution | P01 | Cells count up, the failing cell flushes red, and the leader line draws to the blok, whose corners extend |
| Linter | P02 | Highlights land one by one, balloons pop in, and the legend slides in |
| Counters / bars | P05 | Numbers count up with a cubic ease-out; pass bars fill |
| Corner measure | `.frame--live` | Corners extend from 10px to 22px on hover (registered `--cl` property) |
| Blok enter / leave | Editor | Enter: 560ms rise with the corners collapsing from 46px. Leave: 300ms slide and fade, then neighbours FLIP |
| Drag reorder | Editor | The blok lifts (scale 1.012, shadow) and neighbours FLIP as its centre crosses theirs. On drop it settles over 280ms |
| Autosave | Editor | A dashed spinner "Saving" for 900ms after the last change, then "Saved · vN" and a new History row rising in |
| Hover sync | Editor | Blok ↔ compiled span highlight; the compiled panel scrolls the span into view |
| Run streaming | Editor › Run | Words stream every 26–70ms with a blinking caret; a meter fills; tokens, time and cost tick up |
| Upgrade sheet | Dialog | Rises in; the ◆ stamp lands with an overshoot; perks cascade |
| Construction sheet | Sign in | The grid draws, then the plate, dimensions, glyph outlines and vertex markers. The plate fills, then 41 ↔ AI morphs every 3.2s with every vertex marked and its coordinates ticking live |

**In React / Next.js:** use Framer Motion `layout` (or the View Transitions API) for every FLIP case. Keep line drawing as SVG `stroke-dashoffset`, and keep CSS transitions for hover states. Don't animate layout properties outside the Sheet 02 illustration.

## 9. Cursors

32×32 SVGs in `assets/cursors`. Each one is a chalk stroke over a ground keyline, so it reads on both blue and white.

| Cursor | Hotspot | Fallback | Where |
|---|---|---|---|
| Arrow | 5, 3 | default | Everywhere |
| Target | 16, 16 | pointer | Links, buttons, tabs, summary |
| I-beam | 16, 16 | text | Inputs, editable text |
| Move | 16, 16 | grab | Blok grip |
| Crosshair | 16, 16 | crosshair | Editor sheet background, landing hero |

Cursors are plain CSS. Touch devices show none.

## 10. Accessibility

- Visible focus on everything (2px accent outline).
- Body text contrast is at least 7:1, and muted text at least 5.6:1.
- Bloks reorder with the keyboard (focus the grip, then ↑ ↓) and announce the result in a polite live region.
- Tabs use `role="tablist"`, `aria-selected` and `aria-controls`.
- Dialogs are native `<dialog>`.
- The hero drawings are `aria-label`led figures; decorative SVGs are `aria-hidden`.
- Color is never the only signal: fails use ✕ plus red, and the plan uses the stamp shape.

## 11. Copy

- Write plainly, from the user's side of the screen. Use short sentences.
- A control says exactly what it does ("Copy prompt", "Upgrade with Stripe"), and its toast confirms it in the past tense ("Copied", "Restored v5 as v9").
- Terms: **blok** (never "block"), **Free**, **Performance** (the plan), **expects** (the blok type).
- No em-dash asides and no exclamation marks.

## 12. Mockup-only content

These exist only in the mockup:

- The `.mock-tag`.
- `[YOUR EMAIL]` and `$TBD`.
- Every example prompt, number and test result. The landing page labels these "Example".
- The canned run reply.
- The simulated Stripe Checkout hand-off and export.
- The placeholder Terms and Privacy links.
