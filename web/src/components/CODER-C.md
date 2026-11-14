# Coder C integration handoff

The user expanded the layout request to include working characteristics sliders,
selected-site details, and a navigable 3D planet. `App.jsx` now mounts
`AnalogExplorer`; `/layout-preview.html` mounts the same experience. The former
standalone display-state demo has been replaced. Everything remains on `layout`.

## Components and contracts

- `Layout`: original left/centre/right slots, optional loading, plus optional
  planet and onPlanetChange for the Mars/Earth buttons. Moon remains disabled.
- `CharacteristicsPanel`: controlled target-value sliders for slope, albedo,
  thermal and sun (0?1), plus optional ice/geology preferences and reset.
- `AnalogExplorer`: loads sites.json, keeps UI state, ranks sites on the selected
  planet, connects sliders, results, globe markers, and details. The user can
  browse either Earth or Mars against custom desired characteristics (Mode C).
- `PlanetExplorer`: lazy-loaded react-globe.gl; drag, scroll/pinch, keyboard
  arrows, +/- and camera buttons. Selecting a result moves the camera. Globe
  markers select results. WebGL failures leave the result list usable.
- `DetailPanel`: original site, target, result={score,parts} contract, plus loading.
  Contains LimitsPanel, so do not duplicate it. Null means unavailable, never zero.
- `LimitsPanel`: Earth/Mars environmental differences with NASA source links.

`explorerMatching.js` supplies custom-target comparisons only. It uses equal
weights, numeric similarity 1-abs(a-b), categorical ice equality, and geology
intersection divided by larger unique tag set. Missing values are skipped with
remaining weights renormalized. All-missing produces null, never 0. Coder A's
lib/scoring.js is unchanged and can replace this adapter during final integration.

The desired-value sliders are NOT importance weights. Results show the number of
available factors so incomplete samples are not silently presented as complete.
The selected result is preserved when sliders move; switching planet selects its
best available result. Research pros/cons are not generated from the score.

Numeric n.* values are normalized; no physical units are fabricated. Coordinates
use degrees; Mars elevation uses metres and is not scored. A 70% bar-color threshold
is labeled as a UI guide, not a scientific criterion. Text equivalents accompany
charts. All current sites.json data remains explicitly marked as FAKE/sample.

## Design and assets

Dark garnet #351722, toasted almond #e8cfaf, dark orange #c5682f. JetBrains Mono is
self-hosted through @fontsource-variable/jetbrains-mono. Main desktop panels scroll
independently; tablet/mobile layouts stack. Styles are scoped to mtm- classes.

Planet textures are in public/explorer-textures with attribution. Solar System
Scope / INOVE, CC BY 4.0, based on NASA imagery, enhanced colors and illustrative
gap filling. They are visualization backgrounds only, not measurement layers.
This is globe orbit/zoom navigation, not street-level imagery or a tiled terrain
engine. Globe rendering is lazy-loaded; its Three.js bundle still triggers Vite's
large-chunk advisory. Existing Recharts and react-globe.gl packages were reused.

## Run and verify

From web/: npm ci, npm run dev. Open / or /layout-preview.html.
Checks: npm run lint; npm run build; node --test test-explorer.mjs.
Browser checks cover WebGL rendering, live score changes, reset, selection and
camera focus, keyboard and mouse-drag orbit, Earth/Mars switching, and responsive
widths 1440, 1101, 900, 390 and 320px. No browser exceptions or horizontal overflow.

The data pipeline, research content and scientific validation remain team-owned.
The 18:00 check-in remains a team coordination task. No teammate messages, merges,
commits or remote pushes were made.
