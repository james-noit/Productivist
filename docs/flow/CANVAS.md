# Flow canvas: bounded, self-adapting viewport

Status: **implemented** on `feature/flow-canvas-bounds` (build and `check:lazy` pass, initial bundle unchanged at 322.81 kB; the browser checklist below still has to be walked through by hand). Deviations from the plan:

- `zoomAround` does not push a viewport that is already below `min` back up when zooming out (`factor < 1` uses `min(min, k)` as the floor), so a diagram that grew while zoomed out does not jump.
- The lane bands' tint is now mixed with `--color-surface` instead of `transparent` (also the drop and collapsed variants): with a 5% tint over a transparent base the dots would show through the columns, and the plan wants them only outside.
- The centre anchor shifts the *clamped* viewport (computed with the old size) rather than the raw one, so a view that was being held at an edge by the clamp does not jump.
- The grid custom properties are bound as ready-made `px` strings (`grid` computed), and the dot spacing doubles while the zoom would pack dots closer than 12 px.
- `fitZoom` takes the same arguments as `fitViewport`; `minZoomFor` uses padding 16 (the canvas's) and no left inset.

## The problem

Observed in the `flow` presentation (`flow-canvas`), reproduced in the dev build:

1. **You can lose the diagram.** Panning (drag, wheel, arrow keys, pinch) and zooming are unbounded: `setViewport`
   accepts any `x/y`. The lane bands only cover `0..lanesWidth` × `0..bottom + 600` world px; everything else is
   blank `--color-surface`. One drag and the canvas is empty, with no hint of where the diagram went. Only *Fit*
   (button or `1`) brings it back, and it is not obvious.
2. **Blank space even when you did nothing.** `fitViewport` centres the diagram vertically, so a short diagram
   floats in the middle with an empty band above the lane headers, and the lanes stop at a fixed height
   (`bottom + 600`) instead of the bottom of the canvas.
3. **It does not adapt when the view shrinks.** The `ResizeObserver` only refits while `pendingFit` is set (a
   project seen for the first time, until the first pan/zoom). Once a viewport is stored, resizing the window,
   rotating a phone or leaving Focus mode keeps the same top-left offset and zoom: the right and bottom of the
   diagram are cropped, and a viewport stored on a wide screen is restored as-is on a narrow one.

## Proposal (summary)

| # | Change | Effect for the user |
|---|--------|---------------------|
| A | **Bounded pan.** The viewport is clamped so the diagram can never leave the canvas: it may scroll past an edge by a small overscroll margin, never further. A diagram smaller than the canvas can only move within it. | The diagram cannot be "lost". |
| B | **Minimum zoom tied to the content.** You cannot zoom out much beyond the zoom that fits everything (75 % of the fit zoom, never below today's 25 %). | No more dot-sized diagram in a sea of blank. |
| C | **Lanes fill the canvas.** The lane bands always reach the bottom of the visible area; *Fit* aligns the diagram to the top (centred horizontally) instead of centring vertically. | No blank band above or below the columns. |
| D | **"Fit" is a mode, not a one-off.** After *Fit*, the first visit or *Tidy up*, the canvas keeps fitting on every resize and lane collapse/expand, until the user pans or zooms. Remembered per project. | Shrinking the window, rotating, entering/leaving Focus mode keep the whole diagram in view. |
| E | **Manual views survive a resize.** When not in fit mode, a resize keeps the world point at the centre of the canvas where it was, then clamps. A stored viewport is clamped to the current size on restore. | The part you were looking at stays in view. |
| F | **Off-lane area reads as "outside".** The canvas background outside the lane bands gets a faint dot grid (tokens only), so the overscroll margin is visibly "the edge". | Clear boundary of the workspace. |

Out of scope (possible later): sticky lane headers while scrolled down, auto-pan when dragging a card or a link
near the canvas edge, a minimap. None needs a data change; they can come after this.

No synced data changes, no backend change, no new strings (unless noted), everything stays in the lazy Flow
chunk (`flow-canvas`, `flow-geometry`), so the initial bundle is untouched.

## Implementation plan

All world/screen maths goes in `src/lib/flow-geometry.ts` (pure, framework-free); `flow-canvas.component.ts` only
wires it. Follow the existing style of both files (doc comments on each export, `Viewport` = `screen = world * k + (x, y)`).

### 1. `flow-geometry.ts`: clamp, min zoom, top-aligned fit

- `export const OVERSCROLL = 96;` — screen px the diagram may be pushed past a canvas edge.
- `export function contentBounds(lanes: readonly LaneBox[], bottom: number): Rect` → `{ x: 0, y: 0, w: lanesWidth(lanes), h: bottom + CARD_GAP }`
  (the same rect `fit()` builds today; use it there too).
- `export function minZoomFor(bounds: Rect, width: number, height: number): number` → `Math.max(MIN_ZOOM, Math.min(1, fitK) * 0.75)`
  where `fitK` is the zoom `fitViewport` would pick (factor the zoom calculation out of `fitViewport` into a small
  `fitZoom(bounds, width, height, padding, insetLeft)` and reuse it).
- `clampZoom(k, min = MIN_ZOOM)` and `zoomAround(viewport, factor, cx, cy, min = MIN_ZOOM)` gain an optional minimum
  (defaults keep every current caller working).
- `export function clampViewport(v: Viewport, bounds: Rect, width: number, height: number, margin = OVERSCROLL): Viewport`
  clamps `x` and `y` independently and never touches `k`. Per axis, let `o` be the offset (`v.x` or `v.y`),
  `start = bounds.x * v.k` (or `bounds.y`), `size = bounds.w * v.k` (or `bounds.h`) and `L` the canvas length
  (`width` or `height`); the content then spans screen `[o + start, o + start + size]`.
  - **x:** if `size <= L`, `o ∈ [-start, L - size - start]` (the content stays entirely inside and can only slide
    within the canvas); otherwise `o ∈ [L - size - start - margin, -start + margin]` (at most `margin` px of
    overscroll past either edge).
  - **y:** `o ∈ [min(PAD_TOP, L - size - margin) - start, PAD_TOP - start]` with `export const PAD_TOP = 16`: the
    lane headers can never be pulled down more than 16 px from the top, a tall diagram can be scrolled until its
    bottom is `margin` px above the canvas bottom, and a short one is pinned to the top.
  - Returns the same object when nothing changes (so the computed does not notify needlessly), and is idempotent.
- `fitViewport(..., align: 'center' | 'top' = 'center')`: with `'top'`, `y = padding - bounds.y * k` when the
  content is shorter than the available height (horizontal stays centred). The canvas passes `'top'`.

### 2. `flow-canvas.component.ts`: one raw viewport, one clamped view

- Rename the writable signal to `private readonly rawViewport = signal<Viewport>(DEFAULT_VIEWPORT)` and make
  `readonly viewport = computed(() => clampViewport(rawViewport(), bounds(), size.w, size.h))` (skip the clamp while
  `viewSize().w === 0`). Add `private readonly bounds = computed(() => contentBounds(this.lanes(), this.placement().bottom))`
  and `protected readonly minZoom = computed(...)` from `minZoomFor`.
  Every reader (`worldTransform`, `zoomPercent`, `cullArea`, `bar`, `toWorld`, `toLocal`, gesture origins) keeps
  calling `viewport()`, so they all see the clamped value; content or size changes re-clamp for free, with no effect.
- `setViewport(v)` writes `rawViewport.set(clampViewport(v, …))` (store the clamped value, so a pan that hit the edge
  does not need to be "undone" before moving back), clears fit mode, and debounces the save as today.
- `zoomBy`, `onWheel` (Ctrl/⌘), pinch: pass `this.minZoom()` to `zoomAround` / `clampZoom`.
- The `restoreViewport` and `fit(auto)` direct writes go to `rawViewport`.

### 3. Fit mode (replaces `pendingFit` and `FIT_MIN_WIDTH`)

- `private fitMode = false` (plain field, like `pendingFit` today). Set by `fit()` (both `auto` and manual), by
  `tidyUp()` (it calls `fit()`), and on restore when the stored entry says so. Cleared by `setViewport` from any
  pan/zoom gesture or key (fit itself must not clear it: give `fit` its own write path).
- Stored shape: `productivist.flowViewport` stays `Record<projectId, Viewport>` with an optional `fit?: true`
  (device-local, never synced; old entries without it read as manual). `saveViewport` writes `fit: true` when in fit
  mode. A manual *Fit* is saved (as today); the automatic first fit is still not saved, but leaves fit mode on.
- `ResizeObserver` callback: update `viewSize`; then if `fitMode`, `fit(true)`; else apply the centre anchor
  (step 4). Remove the `FIT_MIN_WIDTH` special case: fit mode already refits on every later resize.
- Lane collapse/expand: an `effect` on `lanes()` that, when `fitMode`, schedules `fit(true)` with
  `afterNextRender` (never write signals synchronously inside the effect; follow the existing `untracked` pattern).
  Do **not** refit on other content changes (adding a task would make the zoom jump); the clamp covers those.

### 4. Centre anchor on resize (manual views)

- Keep the previous size in a plain field. On a size change while not in fit mode:
  `raw = { ...raw, x: raw.x + (newW - oldW) / 2, y: raw.y + (newH - oldH) / 2 }`, written to `rawViewport` without
  clearing fit mode and without saving (the clamp then applies through the computed). Skip when the old size was 0.
- On restore, the stored viewport goes through the computed clamp automatically, so a viewport stored on a desktop
  opens sanely on a phone.

### 5. Lanes fill the visible height

- `worldHeight` becomes `max(placement().bottom + 600, visibleBottom)` where `visibleBottom` is the bottom of
  `visibleWorldRect(viewport(), w, h)` plus one `CARD_GAP`: the bands always reach the canvas's bottom edge.
  (This is a cheap computed; `viewport()` already re-renders the world transform on every pan.)

### 6. Off-lane background (CSS only, `flow-canvas.component.css`)

- On `.flow-canvas`: a `radial-gradient` dot grid made from `color-mix(in srgb, var(--color-border) 70%, transparent)`
  over `--color-surface`, with `background-size` and `background-position` bound to the zoom/pan through two
  custom properties the template sets on the viewport element (`--flow-grid-size`, `--flow-grid-x/y`), so it moves
  with the world. The lane bands already paint their own tint over it, so the dots only show outside the columns.
  Keep it subtle (check all four themes: light, dark, japanese, nordic). Under `forced-colors`, no grid.

### 7. Docs

- `AGENTS.md`, **Flow diagram**: replace the `fit(true)` / `pendingFit` / "narrower than 480 px" sentence with the
  clamp, the content-relative minimum zoom, fit mode (stored `fit: true`), the centre anchor and the lanes filling
  the height. Mention that `flow-geometry` owns `clampViewport`/`minZoomFor`/`contentBounds`.
- This file: switch *Status* to done and list any deviation.

### Verification (no test framework; do it in the dev server, `openpomodoro-dev`)

Seed a project with 2 milestones, 5 tasks and one objective per horizon, open its Flow tab, then check:

1. Drag the background hard in all four directions, wheel-scroll, hold arrow keys: the diagram always stays at
   least partly in view, at most `OVERSCROLL` px past an edge; the lane headers never leave the top by more than 16 px.
2. Ctrl+wheel / `-` all the way out: it stops at ~75 % of the fit zoom; `+` and `0` still work.
3. Press *Fit*, then resize the pane 1200 → 700 → 400 px wide and back, and toggle Focus mode: the whole diagram
   stays fitted. Reload: still fitted (stored `fit: true`).
4. Pan a little, then resize: the centre of what you were looking at stays in the centre; nothing jumps out of view.
5. Collapse and expand a horizon lane in fit mode: it refits. In manual mode: it clamps only.
6. Lanes reach the bottom of the canvas at every zoom; the dot grid shows only outside the columns, in all four themes.
7. Regressions: card drag, link drag, task-row drag between cards, double-click a lane to create, the selection
   toolbar and link menu positions, touch pan/pinch (mobile preset), Outline mode untouched.
8. `npm run build` passes; `npm run check:lazy` passes (nothing new in the initial bundle).
