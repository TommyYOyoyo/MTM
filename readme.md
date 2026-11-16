# Space Out

<img src="web/public/planet-icon.svg" width="64" alt="Space Out icon" align="right" />

**Find Mars-like places on Earth.** Our project for the NASA Space Apps Challenge 2026,
challenge *Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars*.

- Live app: https://nasa.genshinimpact.ca
- Demo deck: https://canva.link/5y9ptjrwxi0vis1
- Space Apps project page: https://www.spaceappschallenge.org/2026/find-a-team/da-bricks/?tab=project

Before a rover, drill or habitat goes to Mars, it gets tested somewhere on Earth. But which
place on Earth is actually the closest match? You pick a Mars landing site, and Space Out
ranks Earth sites by how similar they are in terrain, thermal behaviour, brightness,
sunlight, ground ice and geology, using NASA data measured the same way on both planets.
You decide what matters most for your mission. Every match shows what lines up, where it
falls apart, and what Earth simply can't copy, like Mars's low gravity and thin air.

The famous Río Tinto–Meridiani pair comes out on top, and our global scan turned up 340
candidate sites that nobody on our team has reviewed yet.

## What you get for each match

- A factor-by-factor breakdown and a radar chart (Mars target vs Earth site)
- Mars and Earth images side by side (NASA Mars Trek and NASA Worldview)
- A statistical sanity check: how the site compares with 340 random dry places on Earth
- A tag saying whether it's a known analog or new ground
- An "Earth's limits" panel: gravity, pressure, radiation and liquid water
- Exports as CSV, GeoJSON or KML (KML opens on Mars in Google Earth Pro), and a share link

## How it works

1. **Research data.** 36 sites, 13 on Mars and 23 on Earth
   ([`pipeline/data/sites_input.csv`](pipeline/data/sites_input.csv)). Each one has a
   coordinate source and 33 have a peer-reviewed paper. Coordinates, tags and DOIs were
   checked against their sources; anything that didn't hold up was taken out.
2. **Mars measurements** (Python, rasterio): slope and roughness from the MOLA 463 m
   elevation map, TES albedo, TES nighttime thermal inertia and SWIM subsurface ice.
3. **Earth measurements** (Google Earth Engine): slope and roughness from NASADEM and
   Copernicus GLO-30 resampled to the same 463 m grid, MODIS albedo, and MODIS day and
   night surface temperature to estimate thermal inertia.
4. **Normalization.** Every factor goes on a 0 to 1 scale. Thermal inertia is ranked
   within each planet, since the Mars and Earth numbers aren't the same quantity.
5. **Scoring** (React web app): weighted Gower similarity. Six factors count equally:
   slope, albedo, thermal, sunlight, ice and geology. Missing values are skipped and their
   weight is shared among the others. Roughness is measured but not scored because it
   tracks slope almost exactly (r = 0.91). Subsurface (caves, lava tubes) is built in but
   waits for source-verified data. Mission presets (landing and rovers, ice resources,
   geology) or custom weights are available.

## Validation

Six analog pairs that published papers already link (Río Tinto–Meridiani,
Kilauea–Olympus Mons, Death Valley–Gale, Svalbard–Utopia, El Tatio–Home Plate,
University Valley–Phoenix). Does each Earth site land in the top 5 of 23 for its Mars
partner? Default weights, no tuning.

| Run | Top 5 | Binomial p | Mann-Whitney p |
|---|---|---|---|
| First run | 3 of 6 | 0.12 | 0.11 |
| After treating Earth "permafrost" = Mars "ground ice" | 4 of 6 | 0.023 | 0.007 |

Under 1,000 random weightings, Río Tinto stays in the top 5 in 67% of runs, Svalbard 60%,
Kilauea 53%, University Valley 35%, Death Valley 11% and El Tatio 0%. The weights matter,
which is why the app offers mission presets instead of one universal score. Six pairs is
a small test and the label fix came after the first run, so this is early evidence, not proof.

## Machine learning

- **Global scan:** about 1,700 random land points measured with the same pipeline; green
  (NDVI > 0.2) or wet (> 5% water) points are dropped, leaving 340 candidates. DBSCAN groups
  them into 23 hotspots.
- **Analog families:** PCA + k-means (k by silhouette score) sorts every site into 4
  families mixing Mars and Earth sites (76% of the variation on two components).
- **Nearest neighbours:** the 3 most similar sites on the other planet, for every site.
- **Isolation forest:** flags sites with unusual measurements (e.g. Antarctic Plateau,
  Kilimanjaro) so they're read with care.

## Run it locally

From the repo root, install the web dependencies once, then start the dev server:

```sh
npm --prefix web ci
npm run dev
```

The app opens at `/globe-preview.html` (the production home page shows the same thing).
Checks:

```sh
npm run lint
node --test web/src/lib/*.test.js
python3 -m pytest pipeline
```

## Data pipeline

Python scripts in [`pipeline/`](pipeline) (install with `pip install -r pipeline/requirements.txt`).
Run them from the repo root:

| Script | What it does |
|---|---|
| `process.py` | Research CSV + Mars rasters + Earth Engine values → `web/public/sites.json` |
| `mars.py`, `earth.py` | Measure one planet's sites (raw rasters are in `data/raw/`, not in git) |
| `normalize.py` | Puts every factor on a 0–1 scale |
| `validate.py` | Benchmark check above (top 5, binomial and Mann-Whitney tests) |
| `robustness.py` | 1,000 random weightings (`PYTHONPATH=pipeline python3 pipeline/robustness.py`) |
| `scan.py` | Global scan → `web/public/discovery.json` |
| `hotspots.py` | DBSCAN hotspots for the scan candidates |
| `ml.py` | PCA families, nearest neighbours, outliers → `web/public/families.json` |
| `met.py` | CSA Phoenix MET weather → `web/public/partner-observations.json` |

More detail: [web/COMPARISON_DATA.md](web/COMPARISON_DATA.md) (data schema),
[pipeline/EARTH_ENGINE.md](pipeline/EARTH_ENGINE.md), [pipeline/TERRAIN.md](pipeline/TERRAIN.md).

## Data sources

**NASA:** MGS MOLA 463 m DEM, MGS TES albedo, TES thermal inertia (Putzig & Mellon 2007),
NASADEM, MODIS MCD43A3 albedo, MOD11A2 land surface temperature, MOD13A2 NDVI, HiRISE,
Mars Exploration Zone Workshop 2015, MMGIS rover traverses, NASA Technical Reports Server,
NASA Mars Trek, NASA Worldview, Blue Marble: Next Generation, Viking Merged Color Mosaic.

**Partners and other:** CSA Phoenix MET data, ESA Copernicus DEM GLO-30, SWIM subsurface ice
maps (PSI), JRC Global Surface Water, USGS Gazetteer of Planetary Nomenclature, Smithsonian
Global Volcanism Program, Svalbard polygon dataset (Ulrich et al., PANGAEA), Wikimedia Commons,
Gower (1971). Every paper and DOI per site is in
[`pipeline/data/sites_input.csv`](pipeline/data/sites_input.csv); full credits are on the
app's Credits page.

**Tools:** Python (rasterio, NumPy, pandas, SciPy, scikit-learn, earthengine-api),
Google Earth Engine, React + Vite.

## Team

Space Out (team page: Da Bricks): Lauredant Erving, Perline Shen, Honglue Zheng, Yuecheng Ma,
Christopher Ezael, Hila Geris.

Internal NAS setup scripts are in [scripts/nas-connect](scripts/nas-connect/README.md).

## AI Disclosure
AI tools (Anthropic Claude, OpenAI ChatGPT, and Google Gemini) were used to assist in the code creation, debugging, and research-phase of this project. All results were reviewed and cross-referenced by the team.

## License

MIT, see [LICENSE](LICENSE).
