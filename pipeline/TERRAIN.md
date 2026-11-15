# Site terrain models

The desktop dual comparison reuses `sites.json` and the existing scoring. Each
site can load `web/public/terrain/<id>.json` for its interactive terrain view.
Missing or mismatched models show an unavailable state. Models never change the
comparison score.

The included Gale, Jezero and Phoenix models are sampled from NASA MGS MOLA's
USGS 463 m global DEM. Each covers a 10 km square around the catalog coordinate.
The 65×65 display grid is bilinearly resampled; it does not improve the native
463 m source resolution. Height starts at ×3 for visibility and can be set to ×1
or ×10. Colours indicate relative elevation, not surface composition. NoData
holes are preserved.

## Export from a DEM

Install the pipeline's Python requirements, including `rasterio` and `numpy`.
Run from the repository root:

```sh
python pipeline/export_terrain.py \
  --dem "/path/to/MOLA_463m.tif" \
  --planet mars \
  --sites web/public/sites.json \
  --output web/public/terrain
```

For Earth use `--planet earth` and a NASADEM raster covering the catalog sites.
For another DEM, supply accurate `--source-name` and `--source-url` values.
Mosaic adjacent tiles before exporting a site that crosses tile boundaries.
Only sites with valid coordinates are exported; no DEM coverage means no model.
Do not commit the full raw global DEM.

The JSON contains the site ID, planet, centre latitude/longitude, radius in km,
grid width/height, north-to-south row-major `elevations` in metres, physical
`sizeXM`/`sizeYM`, and source name/URL/native `resolutionM`. Missing heights are
`null`. The viewer validates the ID, coordinates and extraction radius before
building a mesh. Re-export after changing a site's coordinate or radius.

Checks:

```sh
python -m unittest discover -s pipeline/tests -p test_export_terrain.py
node --test web/src/lib/dualComparison.test.js web/src/lib/terrainData.test.js
```
