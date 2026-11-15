"""Build the browser catalog from researcher CSV rows and existing measurements.

This does not fetch or invent measurements. It validates their location binding,
cleans obsolete template instructions, and applies the existing normalization.
"""

import argparse
import copy
import csv
import json
import math
from pathlib import Path
import re

try:
    from .normalize import normalize
except ImportError:
    from normalize import normalize

ROOT = Path(__file__).resolve().parents[1]
UNKNOWN_ICE = {'qaidam_basin_bm', 'sambhar_salt_lake_new_site', 'karapinar_new_site', 'wells_new_site', 'tuya_new_site'}
EDITORIAL_NOTES = {
    'SAMPLE row: verify tags/ice against a paper',
    'SAMPLE row: take the centre lat/lon from the OpenPlanetary EZ table or the 2015 workshop abstract',
    'SAMPLE row: benchmark = yes, twin = id of the Mars site it resembles',
    'SAMPLE row: one exact point from the paper, not a whole region',
}
NUMERIC_RAW = {'elevation_m', 'slope_deg', 'roughness_deg', 'albedo', 'subsurf_water', 'ti', 'lst_day_k', 'lst_night_k', 'dT_k', 'apparent_ti'}
MARS_SOURCES = [
    {'name': 'MGS MOLA global DEM · 463 m', 'url': 'https://astrogeology.usgs.gov/search/map/mars_mgs_mola_dem_463m', 'agency': 'NASA / USGS'},
    {'name': 'MGS TES bolometric albedo · 7.4 km', 'url': 'https://astrogeology.usgs.gov/search/map/mars_mgs_tes_global_bolometric_albedo_map_7410m', 'agency': 'NASA / USGS / ASU'},
    {'name': 'MGS TES night thermal inertia · 2007 map', 'url': 'https://pds-geosciences.wustl.edu/missions/mgs/tes-timap.html', 'agency': 'NASA PDS'},
    {'name': 'SWIM ice-consistency map', 'url': 'https://swim.psi.edu/', 'agency': 'NASA / Planetary Science Institute'},
]
MODIS_SOURCES = [
    {'name': 'MODIS MCD43A3.061 shortwave albedo', 'url': 'https://developers.google.com/earth-engine/datasets/catalog/MODIS_061_MCD43A3', 'agency': 'NASA'},
    {'name': 'MODIS MOD11A2.061 land surface temperature', 'url': 'https://developers.google.com/earth-engine/datasets/catalog/MODIS_061_MOD11A2', 'agency': 'NASA'},
]
EARTH_LIMITS = [
    'Earth measurements use 2023 annual MODIS means over a 5 km circular area. The supplied pipeline did not apply MODIS QA-bit filtering.',
    'The Earth thermal proxy is (1 − albedo) / (mean day LST − mean night LST). It is not physical thermal inertia; day and night are separate annual composite means.',
    'Thermal scores are relative ranks within the supplied catalog for each planet. Earth thermal scores above 60° absolute latitude are excluded.',
    'Terrain slope and its standard deviation use a DEM aggregated to nominal 463 m in a geographic projection; physical east–west sampling varies with latitude. DEM acquisition dates differ from the 2023 MODIS period.',
]
MARS_LIMITS = [
    'Mars elevation and albedo are single-pixel samples; slope, slope standard deviation, SWIM and thermal inertia use the supplied pipeline’s square pixel neighbourhoods. Their physical east–west extent varies with latitude.',
    'Mars exploration zones generally use a 25 km nominal neighbourhood, while Earth measurements use a 5 km circular area. Dataset resolutions and acquisition dates differ.',
    'SWIM values express consistency with subsurface ice, not an ice probability or measured ice fraction. Missing map coverage remains unavailable.',
    'Thermal scores are relative ranks within the supplied catalog on each planet; Earth apparent thermal inertia and Mars physical thermal inertia are different quantities.',
]


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def read_json(path):
    def reject(value):
        raise ValueError(f'Non-finite JSON number: {value}')
    return json.loads(Path(path).read_text(encoding='utf-8'), parse_constant=reject)


def write_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')


def csv_number(value, name, site_id):
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ValueError(f'{site_id}: invalid {name}') from None
    if not math.isfinite(number):
        raise ValueError(f'{site_id}: non-finite {name}')
    return number


def clean_rows(path, write_clean_csv=True):
    path = Path(path)
    with path.open(encoding='utf-8-sig', newline='') as source:
        reader = csv.DictReader(source)
        fields = reader.fieldnames
        rows = list(reader)
    if not fields or any(key not in fields for key in ('id', 'name', 'planet', 'lat', 'lon', 'radius_km')):
        raise ValueError('Research CSV is missing required columns')
    seen = set()
    coordinates = set()
    sites = []
    for row in rows:
        if not any(value and str(value).strip() for value in row.values()):
            continue
        if None in row:
            raise ValueError('Malformed CSV row has extra columns')
        row['id'] = (row.get('id') or '').strip()
        if not row['id'] and (row.get('name') or '').strip() == 'Green Valley':
            row['id'] = 'green_valley_ez'
        site_id = row['id']
        if not re.fullmatch(r'[A-Za-z0-9_-]+', site_id):
            raise ValueError(f'Invalid site ID: {site_id!r}')
        if site_id in seen:
            raise ValueError(f'Duplicate site ID: {site_id}')
        seen.add(site_id)
        planet = (row.get('planet') or '').strip().lower()
        if planet not in ('earth', 'mars'):
            raise ValueError(f'{site_id}: invalid planet')
        lat = csv_number(row.get('lat'), 'latitude', site_id)
        lon = csv_number(row.get('lon'), 'longitude', site_id)
        radius = csv_number(row.get('radius_km'), 'radius', site_id)
        if abs(lat) > 90 or abs(lon) > 180 or radius <= 0:
            raise ValueError(f'{site_id}: coordinates or radius out of bounds')
        coordinate_key = (planet, lat, lon)
        if coordinate_key in coordinates:
            raise ValueError(f'{site_id}: duplicate site coordinates')
        coordinates.add(coordinate_key)
        if (row.get('notes') or '').strip() in EDITORIAL_NOTES:
            row['notes'] = ''
        row['use_case'] = re.sub(r'^EXAMPLE:\s*', '', row.get('use_case') or '')
        if site_id in UNKNOWN_ICE:
            row['ice'] = ''
        benchmark = (row.get('benchmark') or '').strip().lower()
        if benchmark not in ('yes', 'no', '', 'true', 'false', '1', '0'):
            raise ValueError(f'{site_id}: invalid benchmark flag')
        site = {key: value if value != '' else None for key, value in row.items()}
        site.update(id=site_id, planet=planet, lat=lat, lon=lon, radius_km=radius,
                    benchmark=benchmark in ('yes', 'true', '1'),
                    tags=[tag.strip().lower() for tag in (row.get('tags') or '').split(',') if tag.strip()],
                    papers=[paper.strip() for paper in (row.get('papers') or '').split(';') if paper.strip()])
        sites.append(site)
    # Write only after every row has passed validation.
    if write_clean_csv:
        with path.open('w', encoding='utf-8', newline='') as target:
            writer = csv.DictWriter(target, fieldnames=fields, lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)
    return sites


def validate_binding(record, site, supplement=False):
    record_id = record.get('siteId') if supplement else record.get('id')
    if record_id != site['id'] or record.get('planet') != site['planet']:
        raise ValueError(f"{site['id']}: measurement identity does not match")
    for field in ('lat', 'lon', 'radius_km'):
        value = record.get(field)
        if not finite(value) or abs(value - site[field]) > 1e-6:
            raise ValueError(f"{site['id']}: measurement {field} does not match research coordinates/area")
    raw = record.get('raw')
    if not isinstance(raw, dict):
        raise ValueError(f"{site['id']}: raw measurements must be an object")
    for key, value in raw.items():
        if key in NUMERIC_RAW and value is not None and not finite(value):
            raise ValueError(f"{site['id']}: invalid raw {key}")
    # Reject nested non-finite values without coercing any supplied numbers.
    json.dumps(raw, allow_nan=False)
    return copy.deepcopy(raw)


def earth_sources(raw):
    copernicus = 'copernicus' in str(raw.get('dem', '')).lower()
    dem = {
        'name': 'Copernicus DEM GLO-30 · 2024_1' if copernicus else 'NASADEM HGT.001',
        'url': 'https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_DEM_GLO30_2024_1' if copernicus else 'https://developers.google.com/earth-engine/datasets/catalog/NASA_NASADEM_HGT_001',
        'agency': 'Copernicus / ESA' if copernicus else 'NASA',
    }
    return [dem, *copy.deepcopy(MODIS_SOURCES)]


def build_sites(csv_path, measurements_path, supplement_path=None):
    sites = clean_rows(csv_path, write_clean_csv=False)
    measurements = read_json(measurements_path)
    measurement_rows = measurements if isinstance(measurements, list) else measurements.get('sites', [])
    by_id = {}
    for record in measurement_rows:
        if not isinstance(record, dict) or not isinstance(record.get('id'), str):
            raise ValueError('Measurement rows need a site ID')
        if record['id'] in by_id:
            raise ValueError(f"Duplicate measurement ID: {record['id']}")
        by_id[record['id']] = record
    supplement = read_json(supplement_path) if supplement_path and Path(supplement_path).is_file() else None
    raw_by_site = {}
    for site in sites:
        record = by_id.get(site['id'])
        supplemental_raw = validate_binding(supplement, site, supplement=True) if supplement and supplement.get('siteId') == site['id'] else None
        if record is not None:
            raw = validate_binding(record, site)
        elif supplemental_raw is not None:
            raw = supplemental_raw
        else:
            # A real catalog location remains selectable even when measurement coverage is missing.
            raw = {}
        raw_by_site[site['id']] = raw
    normalized = normalize(sites, raw_by_site)
    for site in sites:
        raw = raw_by_site[site['id']]
        site['raw'] = raw
        site['n'] = normalized[site['id']]
        site['sources'] = earth_sources(raw) if site['planet'] == 'earth' else copy.deepcopy(MARS_SOURCES)
        site['sampling'] = {
            'radius_km': 5 if site['planet'] == 'earth' else site['radius_km'],
            'terrain_scale_m': 463.0935,
            'year': 2023 if site['planet'] == 'earth' else None,
            'method': '5 km circular Earth Engine area; annual MODIS composite means' if site['planet'] == 'earth' else 'Existing Mars pipeline: single-pixel elevation/albedo and square pixel neighbourhoods',
        }
        site['limits'] = copy.deepcopy(EARTH_LIMITS if site['planet'] == 'earth' else MARS_LIMITS)
        if site['id'] in UNKNOWN_ICE:
            site['limits'].append('Modern ice is unverified in the research notes and is excluded from scoring. A glacial geology tag can refer to ancient formation conditions.')
        site['data_status'] = 'research_catalog'
    return sites


def earth_export(sites):
    earth = {}
    sources = {}
    for site in sites:
        if site['planet'] != 'earth':
            continue
        raw = site['raw']
        value = lambda key: raw.get(key) if finite(raw.get(key)) else None
        earth[site['id']] = {
            'lat': site['lat'], 'lon': site['lon'], 'radius_km': 5,
            'elevation_m': value('elevation_m'), 'slope_deg': value('slope_deg'),
            'roughness_deg': value('roughness_deg'), 'albedo': value('albedo'),
            'lst_day_c': value('lst_day_k') - 273.15 if value('lst_day_k') is not None else None,
            'lst_night_c': value('lst_night_k') - 273.15 if value('lst_night_k') is not None else None,
            'lst_day_night_c': value('dT_k'), 'apparent_ti': value('apparent_ti'),
            'dem': raw.get('dem'),
        }
        for source in site['sources']:
            sources[source['url']] = source
    return {
        'metadata': {
            'status': 'research_catalog', 'year': 2023, 'date_start': '2023-01-01', 'date_end_exclusive': '2024-01-01',
            'source_commit': '6b464a2', 'sources': list(sources.values()),
            'method': 'Existing pipeline/earth.py measurements. Terrain aggregated to nominal 463.0935 m; circular radius 5 km. MODIS day/night surface temperatures and albedo are independently averaged across 2023 before spatial averaging. No MODIS QA-bit filtering was applied. LST is surface temperature, not air temperature. Missing coverage is null. DEM acquisition dates are separate from the MODIS year.',
            'thermal_proxy': '(1 - albedo) / (annual mean day LST - annual mean night LST); not physical thermal inertia',
        },
        'sites': earth,
    }


def catalog_metadata(sites):
    return {
        'status': 'research_catalog', 'release': 'alpha', 'sourceCommit': '6b464a2',
        'counts': {'total': len(sites), 'mars': sum(s['planet'] == 'mars' for s in sites), 'earth': sum(s['planet'] == 'earth' for s in sites), 'benchmarks': sum(s['benchmark'] and s['planet'] == 'earth' for s in sites)},
        'research_source': 'pipeline/data/sites_input.csv',
        'measurement_source': 'web/public/sites.json raw measurements from completed data commit; Green Valley separately extracted with the same Mars pipeline',
        'normalization': {'slope': 'clip(slope_deg / 30, 0, 1)', 'roughness': 'clip(slope standard deviation in degrees / 15, 0, 1)', 'albedo': 'clip(raw albedo, 0, 1)', 'thermal': 'Separate relative rank within each supplied planetary catalog; Mars TES ti versus Earth apparent_ti; Earth absolute latitude >60° excluded', 'sun': 'Highest annual noon solar-altitude proxy using latitude and axial tilt, normalized to 0–1; not measured insolation'},
        'cleaned': {'assigned_id': {'Green Valley': 'green_valley_ez'}, 'removed': 'Only obsolete SAMPLE editorial notes and EXAMPLE use-case prefixes', 'modern_ice_unknown': sorted(UNKNOWN_ICE), 'permafrost': 'Preserved from researcher CSV; not silently relabelled as ground ice'},
        'limitations': [*EARTH_LIMITS, *MARS_LIMITS, 'Catalog entries are researcher-supplied candidates; completing this import does not establish scientific validation, global discovery, or field suitability. Some rows lack papers or coordinate-source links.', 'Benchmark pairings are only the six explicitly marked Earth rows; unresolved twin labels are not inferred.'],
    }


def prepare_web_data(csv_path=ROOT / 'pipeline/data/sites_input.csv', measurements_path=ROOT / 'web/public/sites.json', supplement_path=ROOT / 'pipeline/data/green_valley_measurements.json', output_path=ROOT / 'web/public/sites.json', earth_output_path=ROOT / 'web/public/earth-engine.json', metadata_output_path=ROOT / 'web/public/catalog-metadata.json'):
    sites = build_sites(csv_path, measurements_path, supplement_path)
    earth = earth_export(sites)
    metadata = catalog_metadata(sites)
    # Validate all generated JSON before mutating sources or outputs.
    for data in (sites, earth, metadata):
        json.dumps(data, allow_nan=False)
    clean_rows(csv_path, write_clean_csv=True)
    write_json(output_path, sites)
    write_json(earth_output_path, earth)
    write_json(metadata_output_path, metadata)
    return {'sites': sites, 'earth_engine': earth, 'metadata': metadata}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sites-csv', type=Path, default=ROOT / 'pipeline/data/sites_input.csv')
    parser.add_argument('--measurements', type=Path, default=ROOT / 'web/public/sites.json')
    parser.add_argument('--supplement', type=Path, default=ROOT / 'pipeline/data/green_valley_measurements.json')
    parser.add_argument('--output', type=Path, default=ROOT / 'web/public/sites.json')
    parser.add_argument('--earth-output', type=Path, default=ROOT / 'web/public/earth-engine.json')
    parser.add_argument('--metadata-output', type=Path, default=ROOT / 'web/public/catalog-metadata.json')
    args = parser.parse_args(argv)
    result = prepare_web_data(args.sites_csv, args.measurements, args.supplement, args.output, args.earth_output, args.metadata_output)
    print(json.dumps(result['metadata']['counts']))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
