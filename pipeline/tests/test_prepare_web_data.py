import copy
import csv
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from pipeline.prepare_web_data import UNKNOWN_ICE, build_sites, prepare_web_data
from pipeline.normalize import normalize


class PrepareWebDataTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.csv = self.folder / 'sites.csv'
        self.measurements = self.folder / 'measurements.json'
        self.supplement = self.folder / 'green.json'
        self.csv.write_bytes((ROOT / 'pipeline/data/sites_input.csv').read_bytes())
        self.original = json.loads((ROOT / 'web/public/sites.json').read_text())
        self.measurements.write_text(json.dumps(self.original))
        self.supplement.write_bytes((ROOT / 'pipeline/data/green_valley_measurements.json').read_bytes())

    def build(self):
        return build_sites(self.csv, self.measurements, self.supplement)

    def mutate_csv(self, change):
        with self.csv.open(newline='') as source:
            reader = csv.DictReader(source)
            fields, rows = reader.fieldnames, list(reader)
        change(rows)
        with self.csv.open('w', newline='') as target:
            writer = csv.DictWriter(target, fieldnames=fields)
            writer.writeheader()
            writer.writerows(rows)

    def test_complete_catalog_has_all_research_sites_and_real_measurements(self):
        sites = self.build()
        self.assertEqual(len(sites), 36)
        self.assertEqual(sum(s['planet'] == 'mars' for s in sites), 13)
        self.assertEqual(sum(s['planet'] == 'earth' for s in sites), 23)
        by_id = {s['id']: s for s in sites}
        self.assertEqual(len(by_id), 36)
        self.assertEqual(by_id['green_valley_ez']['raw']['elevation_m'], -4116)
        self.assertEqual(by_id['green_valley_ez']['raw']['ti'], 188.1)
        for old in self.original:
            self.assertEqual(by_id[old['id']]['raw'], old['raw'])
        for site in sites:
            self.assertFalse((site.get('notes') or '').startswith('SAMPLE'))
            self.assertFalse((site.get('use_case') or '').startswith('EXAMPLE'))
            self.assertTrue(site['sources'])
            self.assertEqual(site['data_status'], 'research_catalog')

    def test_existing_normalization_is_recomputed_over_full_cohort(self):
        sites = self.build()
        expected = normalize(sites, {s['id']: s['raw'] for s in sites})
        for site in sites:
            self.assertEqual(site['n'], expected[site['id']])
        by_id = {s['id']: s for s in sites}
        self.assertAlmostEqual(by_id['green_valley_ez']['n']['thermal'], 2 / 12)
        for site in sites:
            if site['planet'] == 'earth' and abs(site['lat']) > 60:
                self.assertIsNone(site['n']['thermal'])

    def test_research_categories_and_only_explicit_benchmarks_are_preserved(self):
        sites = self.build()
        by_id = {s['id']: s for s in sites}
        self.assertEqual({s['id'] for s in sites if s['benchmark']}, {'university_valley_bm', 'kilauea_bm', 'death_valley_bm', 'svalbard_bm', 'rio_tinto_bm', 'el_tatio_bm'})
        for site_id in UNKNOWN_ICE:
            self.assertIsNone(by_id[site_id]['ice'])
        for site_id in ('university_valley_bm', 'svalbard_bm', 'ladakh_new_site'):
            self.assertEqual(by_id[site_id]['ice'], 'permafrost')
        self.assertEqual(by_id['ne_syrtis_ez']['twin'], 'Oman Ophiolites')
        self.assertIn('glacial', by_id['wells_new_site']['tags'])
        self.assertIn('Modern ice and subsurface unverified.', by_id['wells_new_site']['notes'])

    def test_template_cleanup_does_not_remove_scientific_notes_or_papers(self):
        self.mutate_csv(lambda rows: rows[0].update(notes='SAMPLE row: verify tags/ice against a paper', use_case='EXAMPLE: Rover study'))
        sites = self.build()
        self.assertIsNone(sites[0]['notes'])
        self.assertEqual(sites[0]['use_case'], 'Rover study')
        self.assertTrue(sites[0]['papers'])
        self.assertEqual(next(s for s in sites if s['id'] == 'wells_new_site')['notes'], next(s for s in self.original if s['id'] == 'wells_new_site')['notes'])

    def test_green_valley_missing_id_is_recovered_without_fabricating_measurements(self):
        self.mutate_csv(lambda rows: next(r for r in rows if r['id'] == 'green_valley_ez').update(id=''))
        self.measurements.write_text(json.dumps([s for s in self.original if s['id'] != 'green_valley_ez']))
        green = next(s for s in self.build() if s['id'] == 'green_valley_ez')
        self.assertEqual(green['raw'], json.loads(self.supplement.read_text())['raw'])

    def test_measurement_and_supplement_binding_cannot_attach_to_wrong_coordinates(self):
        broken = copy.deepcopy(self.original)
        broken[0]['lat'] += 1
        self.measurements.write_text(json.dumps(broken))
        with self.assertRaisesRegex(ValueError, 'does not match'):
            self.build()
        self.measurements.write_text(json.dumps(self.original))
        supplemental = json.loads(self.supplement.read_text())
        supplemental['radius_km'] = 5
        self.supplement.write_text(json.dumps(supplemental))
        with self.assertRaisesRegex(ValueError, 'does not match'):
            self.build()

    def test_duplicate_ids_coordinates_and_nonfinite_numbers_are_rejected(self):
        self.mutate_csv(lambda rows: rows[1].update(id=rows[0]['id']))
        with self.assertRaisesRegex(ValueError, 'Duplicate site ID'):
            self.build()
        self.csv.write_bytes((ROOT / 'pipeline/data/sites_input.csv').read_bytes())
        self.mutate_csv(lambda rows: rows[1].update(lat=rows[0]['lat'], lon=rows[0]['lon']))
        with self.assertRaisesRegex(ValueError, 'duplicate site coordinates'):
            self.build()
        self.csv.write_bytes((ROOT / 'pipeline/data/sites_input.csv').read_bytes())
        broken = copy.deepcopy(self.original)
        broken[0]['raw']['slope_deg'] = float('nan')
        self.measurements.write_text(json.dumps(broken))
        with self.assertRaisesRegex(ValueError, 'Non-finite'):
            self.build()

    def test_repeated_build_is_idempotent_and_earth_export_uses_real_ids_and_units(self):
        earth_path, metadata_path = self.folder / 'earth.json', self.folder / 'metadata.json'
        args = (self.csv, self.measurements, self.supplement, self.measurements, earth_path, metadata_path)
        first = prepare_web_data(*args)
        first_bytes = [p.read_bytes() for p in (self.csv, self.measurements, earth_path, metadata_path)]
        second = prepare_web_data(*args)
        self.assertEqual(first, second)
        self.assertEqual(first_bytes, [p.read_bytes() for p in (self.csv, self.measurements, earth_path, metadata_path)])
        earth = first['earth_engine']['sites']
        self.assertEqual(len(earth), 23)
        self.assertEqual(set(earth), {s['id'] for s in first['sites'] if s['planet'] == 'earth'})
        yungay = next(s for s in first['sites'] if s['id'] == 'atacama_yungay_bm')
        self.assertAlmostEqual(earth[yungay['id']]['lst_day_c'], yungay['raw']['lst_day_k'] - 273.15)
        self.assertEqual(earth[yungay['id']]['lst_day_night_c'], yungay['raw']['dT_k'])
        self.assertIn('No MODIS QA-bit filtering', first['earth_engine']['metadata']['method'])
        self.assertEqual(first['metadata']['counts'], {'total': 36, 'mars': 13, 'earth': 23, 'benchmarks': 6})


if __name__ == '__main__':
    unittest.main()
