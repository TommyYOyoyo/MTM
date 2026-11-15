# Earth Engine data for the globe

This optional Python step samples NASA Earth datasets for the Earth locations in
`web/public/sites.json` and writes `web/public/earth-engine.json`. The globe preview
shows the results for a location only when its ID and coordinates still match.
The existing Mars data and similarity scores are not changed.

## Setup and run

Use a Google Cloud project registered for Earth Engine, with the Earth Engine API
enabled and access granted to your Google account. From the repository root:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install earthengine-api
earthengine authenticate --scopes=https://www.googleapis.com/auth/earthengine.readonly
python pipeline/earth_engine.py --project YOUR_PROJECT_ID
```

The authentication step opens Google's sign-in flow. It stores credentials outside
the repository; do not commit credentials. No browser API key is needed. For
unattended environments, use appropriately scoped Application Default Credentials
instead. See [Google's authentication guide](https://developers.google.com/earth-engine/guides/auth).

The defaults are 2023 and a 5 km radius. Change them or use another site list with
`--year`, `--radius-m`, `--sites`, and `--output`; run the script with `--help` for
details. Rerun it after site coordinates change. A failed request leaves the
previous output file untouched.

To inspect the preview, run `npm run dev` in `web` and open
`http://localhost:5173/globe-preview.html`. Its existing site list contains **fake
test locations**; Earth Engine measurements at those coordinates do not validate
them as analog sites. Replace the list with reviewed sites before drawing research
conclusions. The production build also includes `globe-preview.html`; the main app
is a separate teammate-owned entry point and must be wired up separately.

## Data and limitations

- [NASADEM HGT.001](https://developers.google.com/earth-engine/datasets/catalog/NASA_NASADEM_HGT_001): elevation and slope from the native 30 m DEM, sampled over the area. NASADEM is from 2000 and does not cover the poles. Its slope scale is different from Mars MOLA's.
- [MOD11A2.061](https://developers.google.com/earth-engine/datasets/catalog/MODIS_061_MOD11A2): mean day and night land surface temperatures from 8-day, 1 km composites, using good mandatory-quality pixels. The day–night difference is between separately averaged values, not paired daily differences or thermal inertia.
- [MCD43A3.061](https://developers.google.com/earth-engine/datasets/catalog/MODIS_061_MCD43A3): shortwave white-sky albedo at 500 m, using good mandatory-quality pixels. The daily products use overlapping 16-day windows.

MODIS values are averaged over available observations in the requested year and
then across the circular area. Masked or unavailable measurements remain null.
The output records sources, radius, year and method; do not treat these measurements
as exact point observations or a validated Earth–Mars similarity score.
