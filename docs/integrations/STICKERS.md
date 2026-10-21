# Forge stickers: the GitHub / GitLab / Forgejo / Codeberg / Gitea badges

A small "sticker" with the platform's logo, gently floating over a very soft shadow. It identifies which forge an
account or an imported project belongs to. This is the implementation plan; read `AGENTS.md` (in particular **Git forge
import**, the lazy-chunk rules and **Design tokens**) first.

## 1. Where it shows

| Place | Component | Size | Accessible name |
| --- | --- | --- | --- |
| Configuration → Integrations, each account row, before the account name | `forge-connections-settings` (`.fcs__who`) | `md` (28 px) | decorative (`aria-hidden`): the row already says the name |
| Configuration → Integrations, *Add account*, each platform option of the `.segmented`, before the platform name | same | `sm` (18 px) | decorative |
| Tasks and projects, Cards layout: stuck on the top-right corner of the project's icon tile | `project-card` (`.pcard__icon`) | `sm` | the name button keeps a visually hidden " · GitHub" |
| Tasks and projects, List layout: same corner of the row's icon tile | `project-row` (`.prow__icon`) | `xs` (14 px) | same, in the row's name button |

It replaces the current neutral `git` `ui-icon` mark (`.pcard__forge` / `.prow__forge`) in the name button. Optional,
same component: the `project-forge-status` strip in the project header ("Synced 5 min ago · GitHub"), `xs`, decorative.

## 2. The logos

New lazy file `src/lib/forge-logos.ts`:

```ts
export interface ForgeLogo {
  /** viewBox of the path data (Simple Icons use 0 0 24 24). */
  viewBox: string;
  /** One or more `d` strings, drawn with fill="currentColor". */
  paths: readonly string[];
  /** Sticker face colour (the brand colour) and the glyph colour on it. */
  face: string;
  ink: string;
}
export const FORGE_LOGOS: Record<ForgeFlavor, ForgeLogo> = { github: …, gitlab: …, forgejo: …, codeberg: …, gitea: … };
```

- **Source:** copy the five single-path marks from [Simple Icons](https://simpleicons.org) (`github`, `gitlab`,
  `forgejo`, `codeberg`, `gitea`). Do **not** add the `simple-icons` package (it ships thousands of icons); paste the
  five `path` strings and put the Simple Icons version and its licence (CC0 for the SVG data) in a comment at the top.
  The marks themselves remain their owners' trademarks; a comment says they are used only to name the platform the
  account or project comes from (nominative use).
- **Colours** (brand colours, the one sanctioned exception to "tokens only", kept in this file and the component's
  CSS, never in `style.css`): GitHub face `#181717` / ink `#ffffff`; GitLab `#FC6D26` / `#ffffff`; Forgejo `#FB923C` /
  `#ffffff`; Codeberg `#2185D0` / `#ffffff`; Gitea `#609926` / `#ffffff`. Check each against the brand page once
  while implementing and adjust if a platform has updated it.
- **Brand rules that shape the design** (GitHub's and GitLab's logo guidelines): do not rotate, distort, recolour
  outside the approved one-colour versions, or add effects *to the mark itself*. Hence: the glyph is always the
  official shape in solid white; the tilt-free sticker moves only by translation; the shadow belongs to the sticker,
  not the glyph. No rotation, even though real stickers are often tilted.
- These are **fills**, unlike `ui-icon` and the project icons (1.75 strokes). Document that difference in AGENTS.md
  so nobody "fixes" them into strokes.
- Unknown flavour: fall back to the existing `git` `ui-icon` on a neutral face (`--color-surface-alt`, ink
  `--color-text-muted`).

## 3. The component: `forge-sticker`

`src/app/components/forge-sticker/forge-sticker.component.{ts,html,css}`, standalone, OnPush, no dependencies but
`lib/forge-logos.ts`, `lib/forge-flavors.ts` and `ui-icon` (fallback).

Inputs (signals):

- `flavor: ForgeFlavor | null` — or, to save callers a lookup, `source: { kind; host } | null` and the component
  derives the flavour with `flavorOf` in a `computed`. Accept both; `flavor` wins.
- `size: 'xs' | 'sm' | 'md'` (14 / 18 / 28 px), default `sm`.
- `label: string | null` — when set, the host gets `role="img"` and `aria-label`/`title`; when null, `aria-hidden="true"`.
- `float: 'always' | 'hover' | 'never'`, default `always` (see 3.2).
- `seed: string` — any stable id (connection id, project id), only used to offset the animation phase.

### 3.1 Look

```
   ╭───────╮   2px "die-cut" edge in --color-surface (the white border of a real sticker)
   │ (logo)│   face = brand colour, glyph = white, ~62% of the face
   ╰───────╯
    ‿‿‿‿‿     soft elliptical shadow below, not attached
```

- Host: `display: inline-block; position: relative; width/height: var(--sticker-size)`. The face is an inner `span`
  with `border-radius: 30%` (a squircle, closer to the brands' app-icon look than a circle; make it a token
  `--sticker-radius` so a circle is a one-line change), `background: var(--sticker-face)`, `color: var(--sticker-ink)`,
  `box-shadow: 0 0 0 2px var(--color-surface)` for the die-cut edge (in `xs`: 1.5px), plus a *very* subtle lift:
  `0 1px 1.5px color-mix(in srgb, var(--color-text) 10%, transparent)`.
- Glyph: an inline `<svg viewBox=…><path fill="currentColor" d=…/></svg>` centred, `aria-hidden`.
- Ground shadow: `::after` under the face, `width: 70%`, `height: 14%`, `bottom: -18%`, centred,
  `border-radius: 50%`, `background: color-mix(in srgb, var(--color-text) 14%, transparent)`, `filter: blur(1.5px)`
  (`xs`: 1px), `opacity: .55`. All shadow colours are mixed from `--color-text` so the four themes and the Sportask
  skins tint it naturally (on dark themes it becomes a faint light haze; tune the percentage per theme only if it looks
  wrong: `--sticker-shadow-strength` on `[data-theme='dark']`, etc.).
- Set the brand colours as `[style.--sticker-face]` / `[style.--sticker-ink]` bindings from the `computed` logo.
  These are plain style bindings, no sanitizer involved.

### 3.2 Floating

Only transform and opacity animate (compositor-only, cheap even with many cards):

```css
@media (prefers-reduced-motion: no-preference) {
  .sticker__face { animation: sticker-float 5.6s ease-in-out infinite; animation-delay: var(--sticker-delay, 0s); }
  .sticker::after { animation: sticker-shadow 5.6s ease-in-out infinite; animation-delay: var(--sticker-delay, 0s); }
}
@keyframes sticker-float  { 0%, 100% { transform: translateY(0); }           50% { transform: translateY(-1.5px); } }
@keyframes sticker-shadow { 0%, 100% { transform: scaleX(1); opacity: .55; } 50% { transform: scaleX(.85); opacity: .35; } }
```

- Amplitude scales with size: `translateY(calc(var(--sticker-size) * -0.07))` (≈1 px at `xs`, 2 px at `md`).
- **Desynchronised:** `--sticker-delay` = `-(hashString(seed) % 5600) ms` (negative delay starts mid-cycle), computed
  once in the component, so a grid of imported projects does not bob in unison. `hashString` is in `lib/sync-engine.ts`,
  already in the initial bundle; importing it from a lazy component does not move anything.
- `float = 'hover'`: the animation is paused (`animation-play-state: paused`) until the closest card or row is hovered
  or has focus inside. Implement with the host class `.sticker--hover` and a `:host-context(.prow:hover, .prow:focus-within)`
  rule, or simply by the caller adding a class; keep it in the sticker's CSS.
- Defaults per place: settings rows and platform options `always` (few of them, and it is the place to show them off);
  project **cards** `always`; project **rows** `hover` (a dense list of bobbing marks becomes noise).
- Under `prefers-reduced-motion: reduce` nothing moves; the shadow stays at rest. Pause it in hidden tabs for free:
  browsers already throttle CSS animations there.

### 3.3 Placement details

- **Card / row corner sticker:** the sticker is a child of `.pcard__icon` / `.prow__icon` (make that tile
  `position: relative`), `position: absolute; top: -6px; right: -6px` (`xs` in rows: `-4px`), `pointer-events: none`
  so the card's stretched open-link and the ⋯ menu are unaffected, `z-index` below the menu's (the card's controls
  already use `z-index` for that). The tile is `aria-hidden`, so the brand name moves into the name button as a
  `.sr-only` " · GitHub" (or the existing `forge.*` "Imported from {{ref}}" text if it reads better). Remove the old
  `.pcard__forge`/`.prow__forge` span and its CSS.
- **Settings row:** `.fcs__who` becomes a flex row with the `md` sticker first (`gap: .6rem`), the name and host stacked
  next to it. Platform options: the `sm` sticker before the name inside each `.segmented__option`, `gap: .4rem`;
  check the segmented control still fits on a phone (it already wraps; if not, show sticker-only options below 400 px
  with the name as `aria-label`, as other toolbars do).
- Each card computes its flavour once: `protected readonly flavor = computed(() => { const s = this.view().project.source; return s ? flavorOf(s.kind, s.host).id : null; })`
  instead of calling `forgeName(src)` in the template. Same in `project-row`.

## 4. Bundle and lazy loading

- `forge-sticker` and `lib/forge-logos.ts` go into `NEVER_INITIAL_UI` in `scripts/check-lazy-chunks.mjs`.
- The settings component is already lazy. In the projects page, wrap the corner sticker in
  `@if (flavor(); as f) { @defer (on immediate) { <app-forge-sticker … /> } }` so the logo data (≈3–4 kB of paths) is
  fetched only when the page actually shows an imported project; one chunk, shared by every card.
- The initial bundle must not change (measure before and after; record "0 kB" in the Performance section). No new
  `en.json` keys: the brand names are not translated and the hidden label reuses `forgeName`.

## 5. Order of work

1. `lib/forge-logos.ts` with the five marks, colours, source and licence comment.
2. `forge-sticker` component (look, float, reduced motion, seed delay, sizes, fallback).
3. Settings: account rows and platform options.
4. `project-card` and `project-row`: corner sticker, hidden label, remove the old mark, `computed` flavour.
5. Optional: `project-forge-status` header strip.
6. `check:lazy` list, AGENTS.md (a short `forge-sticker` entry under **Shared building blocks**, the fill-vs-stroke
   note, the brand-colour exception, and the bundle line), `npm run build`, `npm run check:lazy`, `npm run build:tb`
   (the add-on's CSP is unaffected: no inline scripts, styles are bound properties).

## 6. Verification (in the dev server)

- Seed one imported project per flavour without a token: set `source` on five local test projects from the console
  (`kind`, `host` = each flavour's default host, `repoId`, `repoPath`, `url`), or use the public-repo imports from
  phase 1. Add one connection per flavour in Integrations with a dummy token **without** pressing *Test and save* if the
  form allows it; otherwise check the platform options only.
- Screenshots of Cards, List and Integrations in all four themes (light, dark, japanese, nordic) and with a Sportask
  skin on; the die-cut edge must separate the GitHub (near-black) sticker from the dark theme's background.
- Phone width (375 px): no overflow of the platform options; the corner sticker does not cover the ⋯ menu.
- `resize_window` with reduced motion (or the DevTools emulation): nothing moves.
- Hover a card and a row: the card was already floating, the row starts; the stretched link and ⋯ still work where
  the sticker sits.
- Screen reader text: a card's name button reads "<project> · GitHub"; the settings row reads the account once.
