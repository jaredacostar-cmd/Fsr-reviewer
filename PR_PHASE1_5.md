# PR — Phase 1.5: Design system

**Branch:** `phase-1-5-design-system` → `main`
**Tests:** `npm test` → **107/107 pass** (92 baseline + 15 new: 9 tokens, 6 design)

## Summary

Establishes the app's visual system before the layout work in Phase 2: dark mode by
default, a single source of colour tokens, a distinct-hue phase palette, a five-step type
scale, an 8px spacing grid, density and presentation modes, a consistent outline icon set,
calm motion, skeleton loading states, and per-view basemaps.

## What changed per file

- **css/app.css** — `:root` now holds dark values (dark is the default); `:root[data-theme="light"]`
  plus a follow-device media query hold the light values. New phase palette (light violet →
  violet → blue → cyan → teal → grey → grey outline), `--cap-over/tight/room` (capacity only),
  `--select` (selection only), and ~30 documented tokens. Type collapsed to 11/12/14/16/22px
  (`--fs-1..5`), weights to 400/500, tabular numerals on tables/tiles, sentence case.
  Spacing on an 8px grid (`--space-1..5`), 8px panel radius / fully-round chips, decorative
  borders cut (kept on inputs and tables), floating map panels 280px corner-anchored.
  Zero hard-coded hex outside the token blocks.
- **css/modes.css** (new) — density overrides, icon sizing, Planning aerial darkening,
  detail fade (≤200ms), `.skel` skeleton blocks, full presentation-mode rules, print
  safeguards.
- **index.html** — inline pre-paint theme script in `<head>` (before stylesheets; no flash);
  links `css/modes.css` and `js/design.js`; presentation-mode shell in `.map-wrap`.
- **js/design.js** (new) — `PeelDesign`: `resolveTheme`, `densityDefault`, `basemapForView`,
  `icon()` (outline SVG set, zero hex), theme/density appliers, print handlers.
- **js/app.js** — `PHASE_COLORS` removed → `phaseColor()`/`token()` read CSS vars
  (getComputedStyle, cached, reset on theme change); ~170 hard-coded hexes eliminated;
  Display fieldset (theme + density) at top of Settings & sources; `canvas-dark` basemap;
  per-view basemaps via `basemapForView` + `data-mapview`; zoom-15 auto-switch to aerial;
  site open flies the map and fades the panel (reduced-motion aware); spinners → skeletons;
  Present button (top-left map control); theme/density excluded from share links.
- **js/aerial.js** — canvas mask/outline tokenized.
- **js/info.js** — tour/help entries for Display settings, dark canvas basemap, zoom-15 rule.
- **scripts/colorblind-check.js** (new) — Machado protanopia/deuteranopia simulation, CIE76
  ΔE, WCAG contrast; parses the real `css/app.css`; exits non-zero on failure.
- **tests/tokens.test.js** (new, 9 tests) — theme structure, token presence, 4.5:1 text /
  3:1 symbol contrast on dark, phase-pair distinguishability under both simulations,
  no hex in `js/`, `PHASE_COLORS` gone.
- **tests/design.test.js** (new, 6 tests) — `resolveTheme` matrix, density defaults,
  `basemapForView`, icon shape/aliases, share-link exclusion, head-script ordering.
- **README.md** — new "Phase 1.5 — Design system" section.

## Where things went (nothing deleted)

- Old blue-ramp phase colours → distinct-hue `--ph-*` tokens (same names, new values).
- `PHASE_COLORS` JS table → `phaseColor()` / `token()` reading CSS variables.
- Hard-coded hexes in `js/` and `css/` → `var(--token)` / computed tokens.
- Inline SVG icons in view tabs and Tools menu → `PD.icon()` outline set.
- "Loading…" spinners → `.skel` skeleton blocks.
- Light-default theme assumption → dark default + explicit Light / Follow device options.

## Verification

- `npm test`: 107/107 pass. `node --check` clean on all touched JS.
- `scripts/colorblind-check.js`: all 21 phase pairs distinguishable under protanopia and
  deuteranopia in both themes (worst pair ΔE 14.0, floor 10); text 4.5:1, symbols 3:1 — PASS.
- No live browser available: fullscreen behaviour, flyTo smoothness, skeleton sheen,
  pre-paint flash fix, and Esri dark-canvas tile availability verified by code inspection
  only. Recommend a visual check (dark + light, desktop + phone) on deploy.

## Assumptions

1. Dark default is per-browser (localStorage), never in share links — a shared link opened
   by someone else renders in *their* theme, not the sender's.
2. The inline `<head>` script duplicates ~8 lines of `resolveTheme` because `js/design.js`
   cannot load synchronously in `<head>`.
3. `canvas-dark` is a new basemap id, so existing users' saved per-view `streets` picks
   persist until they switch views; the zoom-15 rule only fires on `canvas-dark`.
4. Search-result site open now flies to zoom 15 instead of jumping to 17 (keeps the
   auto-aerial rule coherent).
5. Presentation mode shows the Overview headline + 4 Growth tiles (developments shown,
   units planned, people at build-out, jobs), cloned live.
6. The `@starting-style`/allow-discrete fade-out is progressive enhancement — instant
   hide where unsupported.
7. Type/spacing worker kept `font-size: 0` (glyph-hiding dots) and `0.82em` (relative unit
   label); negative hairline margins untouched as functional, not spacing.
8. Borders kept on buttons, toggle chips, pills, tab indicators, fieldsets, status
   left-bars, marker rings and SVG chart elements — removing them would destroy control
   affordances; the "inputs and tables only" rule was applied to decorative
   container/separator borders.
