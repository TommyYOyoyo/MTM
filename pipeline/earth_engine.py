"""Sample NASA Earth datasets through Earth Engine for the existing site list.

Authenticate separately with ``earthengine authenticate`` before running. This
script never signs in, handles credentials, or writes into the site list.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SITES = ROOT / 'web' / 'public' / 'sites.json'
DEFAULT_OUTPUT = ROOT / 'web' / 'public' / 'earth-engine.json'

SOURCES = [
    {'name': 'NASA NASADEM HGT.001', 'url': 'https://developers.google.com/earth-engine/datasets/catalog/NASA_NASADEM_HGT_001'},
    {'name': 'NASA MODIS MOD11A2.061', 'url': 'https://developers.google.com/earth-engine/datasets/catalog/MODIS_061_MOD11A2'},
    {'name': 'NASA MODIS MCD43A3.061', 'url': 'https://developers.google.com/earth-engine/datasets/catalog/MODIS_061_MCD43A3'},
]


def load_earth_sites(path: Path) -> list[dict]:
    with path.open(encoding='utf-8') as handle:
        data = json.load(handle)
    if not isinstance(data, list):
        raise ValueError('Sites file must contain an array of sites.')
    sites = []
    ids = set()
    for site in data:
        if not isinstance(site, dict):
            raise ValueError('Each site must be an object.')
        if site.get('planet') != 'earth':
            continue
        site_id = site.get('id')
        if not isinstance(site_id, str) or not site_id.strip():
            raise ValueError('Each Earth site must have a nonempty string id.')
        if site_id in ids:
            raise ValueError(f'Duplicate Earth site id: {site_id}')
        ids.add(site_id)
        lat, lon = site.get('lat'), site.get('lon')
        for value, lower, upper, label in ((lat, -90, 90, 'latitude'), (lon, -180, 180, 'longitude')):
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not lower <= value <= upper:
                raise ValueError(f'Invalid {label} for Earth site {site_id}.')
        sites.append({'id': site_id, 'lat': lat, 'lon': lon})
    if not sites:
        raise ValueError('Sites file contains no Earth sites.')
    return sites


def number_or_none(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return None
    return value


def _write_json_atomic(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_name = None
    try:
        with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=path.parent, prefix=f'.{path.name}.', suffix='.tmp', delete=False) as handle:
            temp_name = handle.name
            json.dump(data, handle, indent=2, allow_nan=False)
            handle.write('\n')
        os.replace(temp_name, path)
    finally:
        if temp_name and os.path.exists(temp_name):
            os.unlink(temp_name)


def _mean_for_area(image, geometry, scale, ee):
    return image.reduceRegion(reducer=ee.Reducer.mean(), geometry=geometry, scale=scale, maxPixels=10_000_000).getInfo() or {}


def _collections(ee, year):
    start, end = f'{year:04d}-01-01', f'{year + 1:04d}-01-01'
    dem = ee.Image('NASA/NASADEM_HGT/001').select('elevation')
    terrain = dem.rename('elevation_m').addBands(ee.Terrain.slope(dem).rename('slope_deg'))
    albedo_collection = ee.ImageCollection('MODIS/061/MCD43A3').filterDate(start, end)
    lst_collection = ee.ImageCollection('MODIS/061/MOD11A2').filterDate(start, end)

    def valid_albedo(image):
        value = image.select('Albedo_WSA_shortwave')
        quality = image.select('BRDF_Albedo_Band_Mandatory_Quality_shortwave').bitwiseAnd(1).eq(0)
        return value.updateMask(quality).updateMask(value.gte(0).And(value.lte(1000))).multiply(0.001).rename('albedo')

    def valid_lst(image):
        result = []
        for period in ('Day', 'Night'):
            value = image.select(f'LST_{period}_1km')
            quality = image.select(f'QC_{period}').bitwiseAnd(3).eq(0)
            result.append(value.updateMask(quality).updateMask(value.gte(7500)).multiply(0.02).subtract(273.15).rename(f'lst_{period.lower()}_c'))
        return result[0].addBands(result[1])

    # Avoid a no-band mean image for a year outside a collection's availability.
    albedo = albedo_collection.map(valid_albedo).mean() if albedo_collection.size().getInfo() else None
    lst = lst_collection.map(valid_lst).mean() if lst_collection.size().getInfo() else None
    return terrain, albedo, lst


def sample(ee, sites: list[dict], year: int, radius_m: float) -> dict:
    terrain, albedo, lst = _collections(ee, year)
    results = {}
    for site in sites:
        geometry = ee.Geometry.Point([site['lon'], site['lat']]).buffer(radius_m)
        topography = _mean_for_area(terrain, geometry, 30, ee)
        reflectance = _mean_for_area(albedo, geometry, 500, ee) if albedo is not None else {}
        temperatures = _mean_for_area(lst, geometry, 1000, ee) if lst is not None else {}
        day = number_or_none(temperatures.get('lst_day_c'))
        night = number_or_none(temperatures.get('lst_night_c'))
        results[site['id']] = {
            'lat': site['lat'], 'lon': site['lon'],
            'elevation_m': number_or_none(topography.get('elevation_m')),
            'slope_deg': number_or_none(topography.get('slope_deg')),
            'albedo': number_or_none(reflectance.get('albedo')),
            'lst_day_c': day, 'lst_night_c': night,
            'lst_day_night_c': day - night if day is not None and night is not None else None,
        }
    return {
        'metadata': {
            'year': year, 'radius_m': radius_m, 'sources': SOURCES,
            'method': (
                'Area means inside a circular radius around each coordinate. NASADEM elevation and '
                'pixel-level slope use 30 m data from February 2000, not the selected year; coverage '
                'is approximately 56°S–60°N. MODIS shortwave white-sky albedo uses MCD43A3 at 500 m '
                'with mandatory QA bit 0 = 0 and values in [0,1]. Its daily images use overlapping '
                '16-day windows. MOD11A2 day and night land surface temperatures use 1 km 8-day '
                'composites with mandatory QA bits 0–1 = 0. MODIS images are averaged by pixel across '
                'the selected calendar year, then spatially averaged; day and night are independently '
                'masked, so their difference is the difference of separate means, not a paired daily '
                'swing. LST is surface temperature, not air temperature or thermal inertia. Missing '
                'or masked coverage is null. The site coordinates may themselves be placeholders.'
            ),
        },
        'sites': results,
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sites', type=Path, default=DEFAULT_SITES, help='Input sites JSON')
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT, help='Output JSON (does not overwrite the input)')
    parser.add_argument('--project', default=os.environ.get('EE_PROJECT'), help='Earth Engine Cloud project ID (or EE_PROJECT)')
    parser.add_argument('--year', type=int, default=2023)
    parser.add_argument('--radius-m', type=float, default=5000)
    args = parser.parse_args(argv)
    if not args.project or not args.project.strip():
        parser.error('Provide --project or set EE_PROJECT to an Earth Engine-enabled Cloud project ID.')
    if args.year < 2000 or args.year > datetime.now(timezone.utc).year:
        parser.error('Year must be between 2000 and the current year.')
    if not math.isfinite(args.radius_m) or not 1 <= args.radius_m <= 100_000:
        parser.error('Radius must be between 1 and 100000 metres.')
    if args.sites.resolve() == args.output.resolve():
        parser.error('Output must not overwrite the input site list.')
    try:
        sites = load_earth_sites(args.sites)
        try:
            import ee
        except ImportError as error:
            raise RuntimeError('Install pipeline requirements (including earthengine-api) first.') from error
        try:
            ee.Initialize(project=args.project.strip())
            output = sample(ee, sites, args.year, args.radius_m)
        except Exception as error:
            raise RuntimeError('Earth Engine request failed. Check authentication, project access, API enablement, and network connection.') from error
        _write_json_atomic(args.output, output)
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as error:
        print(f'Error: {error}', file=sys.stderr)
        return 1
    print(f'Wrote Earth Engine measurements for {len(sites)} Earth sites to {args.output}.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
