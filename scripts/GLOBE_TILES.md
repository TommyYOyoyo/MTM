# Full-resolution globe tiles

The preview loads 512-pixel local tiles at the zoom level needed. When the tile
manifest or root tile is absent, it falls back to the planet's single JPEG in
`web/public/textures/`. The two full-resolution pyramids are approximately 284 MB
and 10,922 files in total; include the complete `web/public/textures/tiles/`
directory when sharing or deploying the preview.

Tiles are Web Mercator, as required by the current globe library. The highest
level (6) preserves the source's longitude detail at the equator; locations above
roughly 85° north and south are stretched to the poles by the globe's tile engine.
Source imagery is a static mosaic, not live imagery or scientific measurements.
Attribution and source descriptions are in `web/public/textures/CREDITS.md`.

To rebuild from 2:1 equirectangular source images:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install Pillow
python scripts/build_globe_tiles.py earth data/raw/globe-sources/earth/blue-marble-august-21600.jpg
python scripts/build_globe_tiles.py mars data/raw/globe-sources/mars/viking-global-23040.jpg
```

Move an existing planet tile directory aside before regenerating it. The script
stages tiles outside the web app and publishes each planet only after completion.
Refresh an open preview after regenerating tiles. The source images under
`data/raw/` are ignored by Git; the generated tiles are not.
