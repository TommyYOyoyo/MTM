import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from pipeline import earth_engine


class EarthEngineTests(unittest.TestCase):
    def test_input_filters_mars_and_rejects_duplicate_earth_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'sites.json'
            earth = {'id': 'one', 'planet': 'earth', 'lat': 12.0, 'lon': -5}
            path.write_text(json.dumps([earth, {'id': 'mars', 'planet': 'mars'}]), encoding='utf-8')
            self.assertEqual(earth_engine.load_earth_sites(path), [{'id': 'one', 'lat': 12.0, 'lon': -5}])
            path.write_text(json.dumps([earth, earth]), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'Duplicate'):
                earth_engine.load_earth_sites(path)

    def test_invalid_coordinates_and_input_overwrite_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'sites.json'
            path.write_text(json.dumps([{'id': 'x', 'planet': 'earth', 'lat': 91, 'lon': 0}]), encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'latitude'):
                earth_engine.load_earth_sites(path)
            with self.assertRaises(SystemExit):
                earth_engine.main(['--project', 'example', '--sites', str(path), '--output', str(path)])

    def test_sample_preserves_missing_values_and_coordinates(self):
        class Point:
            def __init__(self, coordinates):
                self.coordinates = coordinates
            def buffer(self, radius):
                return (self.coordinates, radius)
        fake_ee = SimpleNamespace(Geometry=SimpleNamespace(Point=Point))
        values = [
            {'elevation_m': 15, 'slope_deg': 2.3},
            {'albedo': 0.2},
            {'lst_day_c': 20, 'lst_night_c': None},
        ]
        with patch.object(earth_engine, '_collections', return_value=('dem', 'albedo', 'lst')):
            with patch.object(earth_engine, '_mean_for_area', side_effect=values) as mean:
                result = earth_engine.sample(fake_ee, [{'id': 'one', 'lat': 12, 'lon': -5}], 2023, 5000)
        self.assertEqual(result['sites']['one']['lat'], 12)
        self.assertEqual(result['sites']['one']['lon'], -5)
        self.assertIsNone(result['sites']['one']['lst_day_night_c'])
        self.assertEqual([call.args[2] for call in mean.call_args_list], [30, 500, 1000])
        self.assertEqual(mean.call_args_list[0].args[1], ([-5, 12], 5000))

    def test_atomic_json_output(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'result.json'
            path.write_text('old', encoding='utf-8')
            earth_engine._write_json_atomic(path, {'value': None})
            self.assertEqual(json.loads(path.read_text(encoding='utf-8')), {'value': None})
            self.assertEqual(list(Path(directory).iterdir()), [path])


if __name__ == '__main__':
    unittest.main()
