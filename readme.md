# Space Out

For the NASA Space-Apps Challenge 2026

## Run the globe locally

From the repository root, install the web dependencies once:

```sh
npm --prefix web ci
```

Then start the development server:

```sh
npm run dev
```

Open the local address printed in the terminal. The globe opens at
`/globe-preview.html`; the separate teammate app entry remains available at `/app.html`.
Press Ctrl+C to stop the server.

The Alpha comparison interface uses the research catalog in `web/public/sites.json`:
13 Mars and 23 Earth locations, with measurements, sources and six explicit
benchmark pairings. Missing and unverified inputs remain missing.
Rebuild the exports with `python pipeline/prepare_web_data.py` without Earth Engine access. See
[web/COMPARISON_DATA.md](web/COMPARISON_DATA.md) for the schema, benchmark pairings,
optional discovery candidates, and analysis files. The production home page now
opens the same comparison interface as the globe preview.

Dual comparison is currently hidden behind `DUAL_COMPARISON_ENABLED` in
`web/src/GlobePreview.jsx`. When enabled, desktop **Compare → Dual comparison** inspects two Earth locations
or two Mars locations side by side. Each half has an independent **Planet / Terrain**
view and scrollable data. It uses the same weights and scoring as Compare.
The included Gale, Jezero and Phoenix terrain models use real MOLA elevations;
Additional terrain models can be exported from downloaded DEMs. See
[pipeline/TERRAIN.md](pipeline/TERRAIN.md) to add terrain models for new sites.

Push test from Thomas Ma :)
Push test from Christoph

Internal NAS setup scripts for macOS and Windows are in
[scripts/nas-connect](scripts/nas-connect/README.md).
