"""Export small, real DEM patches for the browser's interactive terrain viewer.

Example:
  python pipeline/export_terrain.py --dem /path/to/MOLA.tif --planet mars \
      --sites web/public/sites.json --output web/public/terrain

The output grid is a local azimuthal-equidistant square in metres, centered on
the site. Rows run north to south. Bilinear resampling does not improve the
source DEM's resolution; the original resolution and provenance are retained.
No missing elevation is filled or synthesized.
"""

import argparse
import json
import math
from pathlib import Path
import re

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.warp import reproject, transform


SOURCES = {
    "mars": {
        "name": "NASA MGS MOLA DEM, USGS 463 m global mosaic",
        "url": "https://astrogeology.usgs.gov/search/map/mars_mgs_mola_dem_463m",
    },
    "earth": {
        "name": "NASA NASADEM HGT.001",
        "url": "https://doi.org/10.5067/MEaSUREs/NASADEM/NASADEM_HGT.001",
    },
}


def valid_site(site, planet):
    """Only coordinates supplied by the catalog are eligible for export."""
    def finite(value):
        return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)

    return (
        isinstance(site, dict)
        and site.get("planet") == planet
        and isinstance(site.get("id"), str)
        and re.fullmatch(r"[A-Za-z0-9_-]+", site["id"]) is not None
        and finite(site.get("lat")) and -90 < site["lat"] < 90
        and finite(site.get("lon")) and -180 <= site["lon"] <= 180
    )


def local_crs(src, planet, lat, lon):
    """Use the DEM's celestial body; never transform Earth WGS84 into Mars."""
    if planet == "mars":
        params = src.crs.to_dict()
        radius = params.get("R", params.get("a", 3396190))
        body = f"+a={radius} +b={params.get('b', radius)}"
    else:
        body = "+datum=WGS84"
    return CRS.from_string(
        f"+proj=aeqd +lat_0={lat} +lon_0={lon} {body} +units=m +no_defs"
    )


def source_resolution_m(src, output_crs):
    """Estimate native north/east pixel size locally, in physical metres."""
    xs, ys = transform(output_crs, src.crs, [0], [0])
    x, y = xs[0], ys[0]
    # A source pixel's affine vectors also handle rotated rasters.
    xx = [x, x + src.transform.a, x + src.transform.b]
    yy = [y, y + src.transform.d, y + src.transform.e]
    try:
        px, py = transform(src.crs, output_crs, xx, yy)
        distances = [math.hypot(px[i] - px[0], py[i] - py[0]) for i in (1, 2)]
        measured = max(distances)
        if math.isfinite(measured) and measured > 0:
            return round(measured, 3)
    except (ValueError, rasterio.errors.RasterioError):
        pass
    # Export must not pretend a source resolution is known if projection fails.
    return None


def export_patch(src, site, planet, grid=65, radius_km=None, source_name=None, source_url=None):
    """Return a terrain asset, or None when the DEM contains no valid heights."""
    if not valid_site(site, planet):
        raise ValueError("Invalid site coordinates, ID, or planet")
    if src.crs is None:
        raise ValueError("The DEM must have a coordinate reference system")
    if not isinstance(grid, int) or grid < 3 or grid > 129:
        raise ValueError("Grid size must be between 3 and 129")
    radius = radius_km if radius_km is not None else site.get("radius_km", 5)
    if isinstance(radius, bool) or not isinstance(radius, (int, float)) or not math.isfinite(radius) or not 0 < radius <= 500:
        raise ValueError("Radius must be greater than 0 and at most 500 km")
    radius_m = float(radius) * 1000
    destination_crs = local_crs(src, planet, site["lat"], site["lon"])
    # Position vertices at the declared square's endpoints. Reproject samples
    # pixel centers, so extend by half a grid spacing around those endpoints.
    spacing = 2 * radius_m / (grid - 1)
    edge = radius_m + spacing / 2
    destination_transform = from_bounds(-edge, -edge, edge, edge, grid, grid)
    elevations = np.full((grid, grid), np.nan, dtype="float32")
    reproject(
        source=rasterio.band(src, 1),
        destination=elevations,
        src_transform=src.transform,
        src_crs=src.crs,
        src_nodata=src.nodata,
        dst_transform=destination_transform,
        dst_crs=destination_crs,
        dst_nodata=np.nan,
        resampling=Resampling.bilinear,
        init_dest_nodata=True,
        num_threads=2,
        warp_mem_limit=64,
    )
    elevations = elevations * src.scales[0] + src.offsets[0]
    finite = elevations[np.isfinite(elevations)]
    if not finite.size:
        return None
    values = [round(float(value), 2) if np.isfinite(value) else None for value in elevations.flat]
    source = dict(SOURCES[planet])
    if source_name:
        source["name"] = source_name
    if source_url:
        source["url"] = source_url
    source["resolutionM"] = source_resolution_m(src, destination_crs)
    source["resampling"] = "bilinear"
    return {
        "version": 1,
        "siteId": site["id"],
        "planet": planet,
        "lat": site["lat"],
        "lon": site["lon"],
        "radiusKm": float(radius),
        "width": grid,
        "height": grid,
        "sizeXM": 2 * radius_m,
        "sizeYM": 2 * radius_m,
        "elevations": values,
        "minElevationM": round(float(np.min(finite)), 2),
        "maxElevationM": round(float(np.max(finite)), 2),
        "source": source,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dem", required=True, type=Path)
    parser.add_argument("--planet", required=True, choices=["earth", "mars"])
    parser.add_argument("--sites", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--grid", type=int, default=65)
    parser.add_argument("--radius-km", type=float)
    parser.add_argument("--source-name")
    parser.add_argument("--source-url")
    args = parser.parse_args(argv)
    catalog = json.loads(args.sites.read_text())
    sites = catalog if isinstance(catalog, list) else catalog.get("sites", [])
    args.output.mkdir(parents=True, exist_ok=True)
    written = 0
    with rasterio.open(args.dem) as src:
        for site in sites:
            if not valid_site(site, args.planet):
                continue
            asset = export_patch(src, site, args.planet, args.grid, args.radius_km, args.source_name, args.source_url)
            if asset is None:
                print(f"Skipped {site['id']}: no DEM coverage")
                continue
            output = args.output / f"{site['id']}.json"
            output.write_text(json.dumps(asset, separators=(",", ":"), allow_nan=False) + "\n")
            written += 1
            print(f"Exported {output}: {asset['minElevationM']}–{asset['maxElevationM']} m")
    print(f"{written} terrain assets exported")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
