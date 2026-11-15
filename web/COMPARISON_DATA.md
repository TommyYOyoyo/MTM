# Connect the research data

The browser consumes `public/sites.json` using the existing handoff schema. Replace
the current placeholder rows with the pipeline output; no live backend is required.
`n` values must already be normalized by the pipeline. The browser does not invent
measurements or convert Earth temperature swing into Mars thermal inertia.

To connect the final export, replace `web/public/sites.json`, put referenced
images in `web/public/img/` (or `images/`), and reload the webpage. Keep the IDs
stable because benchmarks, Discovery targeting and family labels use them. An
array `[...]` or `{ "metadata": {...}, "sites": [...] }` is accepted. Existing
placeholder rows can be removed; adding real rows does not require a code change.

## Interface readiness

The home page and `/globe-preview.html` both load the comparison interface.
`/app.html` preserves the teammate app entry without changing `App.jsx`.

Connected now: both comparison directions, target selection, the pushed scoring
functions and presets, weights, rankings, coverage filters, a Mars elevation
filter, comparison details, CSV exports, benchmark checks, source/paper links,
and universal analogy limits. The globe highlights the current top five matches.
Selecting a site still centers its marker; space navigation hides the panels.

Research-dependent slots remain explicit: relief/satellite images, research
pros/cons, partner observations, benchmark pairings, Discovery scan results and
PCA/family results. Missing content is shown as pending. No sample score is
presented as scientific validation.

On mobile, the search bar's menu opens a separate Compare page. Changes are held
until Done applies them and returns to the map. Back (including browser Back)
discards the edits. The desktop comparison panel stays on the map.
Comparison direction follows the map's active planet: Earth shows Mars → Earth
and Mars shows Earth → Mars. The direction is a label; switch planets on the map
to change it. Target options contain only locations on the source planet.

For ChatGPT Sites, build with `npm --prefix web run build -- --mode hosted`.
This keeps the lower zoom levels and full fallback images in the site package,
and loads level-six zoom tiles from an immutable commit in the team's public
GitHub repository. The image files are identical to the local full-resolution
tiles. Normal development and production builds keep all tiles local.

The Python measurement, normalization, Discovery and validation pipelines are
still the data team's work; this change does not fabricate their output or edit
their research CSV.

## Site fields

- Required: unique string `id`, `name`, `planet` (`earth` or `mars`), finite `lat`
  (−90 to 90) and `lon` (−180 to 180). Invalid coordinates and duplicate IDs are
  excluded from the map and ranking.
- `n`: `slope`, `albedo`, `thermal`, `sun`, optional `roughness`; each is 0–1 or
  `null`. Invalid normalized values become missing and are noted in `dataIssues`.
- `ice`: agreed category or `null`; `tags`: geology string array; `subsurface`:
  category or `null`. CSV-style comma-separated tags are also accepted.
- `elevation_m`: raw metres, used only to filter Mars locations. It is never scored.
- `raw` (or `measurements`): optional documented measurements with units in field
  names. The details panel also reads these numeric fields at the site root:

  | Value | Accepted fields | Displayed unit |
  | --- | --- | --- |
  | Slope | `slope_deg`, `slope` | degrees |
  | Albedo | `albedo` | unitless |
  | Mars thermal inertia | `thermal_inertia`, `thermal_inertia_j` | J m⁻² K⁻¹ s⁻½ |
  | Earth day–night surface temperature | `lst_day_night_c`, `day_night_c`, `temperature_swing_c` | °C |
  | Roughness | `roughness_m`, `roughness` | metres |
  | Mars elevation | `elevation_m` | metres |

  These are display measurements. Scoring continues to use `n`, so the pipeline
  must provide normalized values separately and record its normalization method.
- `pros`, `cons`, `limits`: arrays of researched statements.
- `sources`: `{name, agency, url}` entries. `papers`: `{title, doi, url}` entries.
  A research-export string `Title | DOI` is accepted. Only HTTP(S) links are shown.
- `img` (or `relief_img`) and `satellite_img`: optional paths such as
  `img/gale.png` or HTTP(S) image URLs. Relative images should begin with `img/`,
  `images/` or `textures/`. No image is fabricated when absent or unavailable.
  `links` and `coord_source` can hold source URLs.
- `placeholder: true`: explicitly marks demonstration data. Names/notes containing
  `FAKE`, `SAMPLE`, `EXAMPLE` or `PLACEHOLDER` also keep that label visible. A wrapper
  `{metadata: {status: "placeholder"}, sites: [...]}` marks the entire dataset.

## Benchmarks

A benchmark is a known Earth analog used to check the ranking against a
researcher-supplied Mars pairing. Set `benchmark: true` and `expectedMarsIds:
["gale"]` (or `benchmarkTargets`). The research CSV's `twin: "gale"` and
`benchmark: "yes"` fields are also supported. Do not infer a pairing just because
a site is marked as a benchmark.

The website's benchmark panel uses equal core weights independently of the
interactive sliders. Validation computes where each paired Earth site ranks
among all Earth candidates for that Mars target. Top five is the
handoff's check. Unpaired sites remain **unconfigured**. Placeholder pairs remain
**placeholder**, even if their demonstration ranking would pass. These checks do
not establish scientific validity by themselves.

## Logic API

`src/lib/comparison.js` adapts data around the team's existing `scoring.js`:

```js
const sites = adaptSites(json)
const weights = normalizeWeights() // exactly equal core weights, totaling 100%
const changed = setFactorWeight(weights, 'slope', 30) // redistributes the remainder
const results = rankComparisons(target, sites, changed, {
  minCoverage: 50,              // percentage of requested factor weight with data
  maxElevation: null,          // Mars filter only; null disables it
  includeMissingElevation: false,
  benchmarkOnly: false,
  query: '',
  tags: [],
})
const report = validateBenchmarks(sites, weights)
const csv = resultsToCsv(results, target, changed)
```

`compareSites()` and ranked rows contain `site`, `score` (0–100 or `null`),
`coverage` (0–100), `parts`, `missingFactors`, `matches`, `breaks`, `partial` and
`placeholder`. Parts retain the scoring contract's `factor`, `weight`, `sim`, and
add `label`, `targetValue`, `candidateValue`, `effectiveWeight` and percentage-point
`contribution`. Missing factors
are excluded from scoring, so coverage must be displayed alongside resemblance.
`matches` contains exact agreement (`sim === 1`); `breaks` contains measured
differences (`sim < 1`). Neither label applies a scientific suitability threshold,
and missing values appear only as missing.

`FACTOR_INFO` supplies labels and method limitations. `WEIGHT_PRESETS` contains
Equal, Landing / rover, Ice / resources and Geology. Equal preserves fractional
percentages to avoid favoring one factor; slider changes redistribute integer
percentage points. Optional roughness and
subsurface start at zero; moving their sliders explicitly enables them.
The default factor set comes from the team's `DEFAULT_WEIGHTS` in `constants.js`.
Named preset IDs and weights come directly from `presets.js` (`landing-rover`,
`ice-resources`, `geology`); update that file when the team's presets change.

## Optional Discovery data

Create `web/public/discovery.json` when the global scan is available. The website
loads it automatically. Supply an array of site objects, `{ "sites": [...] }`, or
`{ "candidates": [...] }`. Each candidate follows the same site contract:

```json
{
  "metadata": { "status": "placeholder" },
  "candidates": [
    {
      "id": "scan-cell-001",
      "name": "Candidate cell",
      "planet": "earth",
      "targetId": "gale",
      "lat": null,
      "lon": null,
      "n": { "slope": null, "albedo": null, "thermal": null, "sun": null },
      "placeholder": true,
      "sources": [],
      "papers": []
    }
  ]
}
```

This is an empty template: replace `lat`/`lon` with verified coordinates before
the row can appear. Fill `n` from the scan, and add its source/method information.
Use an ID distinct from the curated site list. Optional `targetId` limits the
candidate to that selected Mars target; omit it to let the browser compare the
cell against any Mars target. It must match the Mars site's `id`, not its name.

Such results always remain **partial, not yet studied**. The browser ranks
supplied candidates; it does not run the global scan. Only numeric factors are
scored; any accidental ice, geology or subsurface fields are excluded. Their
unavailable weights reduce the reported coverage. Remove the `placeholder` flag
only once the row's actual input measurements are supplied; Discovery remains
unreviewed independently of that flag.

## Optional families / PCA data

Create `web/public/families.json` with either an array of point objects or a
`points` wrapper. The Research panel loads it automatically:

```json
{
  "metadata": { "method": "Describe the offline PCA and clustering inputs" },
  "points": [
    { "id": "site-id", "name": "Site label", "pc1": null, "pc2": null, "family": "Family label" }
  ]
}
```

Replace `pc1` and `pc2` with finite numbers from the offline analysis; points
without both coordinates are omitted. `id` should match a site ID. `name` is an
optional chart label; `family` is the grouping label, and `cluster` is an accepted
alias. The chart is a view of supplied results, not a browser-run clustering
algorithm, and it does not change resemblance scores.

Both optional files can be absent: the corresponding feature remains available
with a pending-data message. The existing `earth-engine.json` is another optional
measurement export; its site IDs and coordinates must match `sites.json`. Those
measurements appear in details, while scoring uses normalized values in `sites`.

## Partner observations

An optional per-site `partner_observations` array populates the details panel.
For example, supply actual CSA Phoenix MET or APXS observations using this shape:

```json
{
  "partner_observations": [{
    "agency": "CSA",
    "name": "Dataset name",
    "url": "https://example.org/source",
    "measurements": [{ "label": "Measurement", "value": null, "unit": "Unit" }]
  }]
}
```

Values remain missing until supplied. These observations are displayed as
context and do not enter the resemblance calculation automatically.

On mobile, selecting a site opens a location page at `#location=<id>`. Its map
uses one third of the viewport and its details scroll below. The Back button
and browser Back return to the main map. The crosshair button recenters the selected point. Desktop retains the floating panels.

## Checks

Run the comparison checks with:

```sh
cd web
node --test test-scoring.mjs src/lib/comparison.test.js
```
