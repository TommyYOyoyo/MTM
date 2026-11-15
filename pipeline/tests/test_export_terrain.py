"""Exercise actual raster reprojection, nodata, and local physical dimensions."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

import numpy as np
import rasterio
from rasterio.transform import from_origin

SPEC = importlib.util.spec_from_file_location("export_terrain", Path(__file__).resolve().parents[1] / "export_terrain.py")
terrain = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(terrain)


class TerrainExportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "terrain.tif"
        self.site = {"id": "test", "planet": "earth", "lat": 0.0, "lon": 0.0, "radius_km": 1}

    def tearDown(self):
        self.temp.cleanup()

    def write(self, values, crs="EPSG:4326", affine=None, nodata=-9999):
        with rasterio.open(self.path, "w", driver="GTiff", width=values.shape[1], height=values.shape[0], count=1,
                           dtype="float32", crs=crs, transform=affine or from_origin(-.1, .1, .002, .002), nodata=nodata) as dst:
            dst.write(values.astype("float32"), 1)

    def test_real_heights_and_row_direction(self):
        self.write(np.arange(100, dtype="float32")[:, None] * np.ones((1, 100)))
        with rasterio.open(self.path) as src:
            asset = terrain.export_patch(src, self.site, "earth", grid=9)
        self.assertEqual(asset["width"], 9)
        self.assertEqual(len(asset["elevations"]), 81)
        self.assertEqual(asset["sizeXM"], 2000)
        self.assertLess(asset["elevations"][4], asset["elevations"][-5])
        self.assertAlmostEqual(asset["elevations"][40], 49.5, places=1)
        self.assertGreater(asset["source"]["resolutionM"], 200)

    def test_missing_coverage_is_not_filled(self):
        self.write(np.full((100, 100), -9999.0))
        with rasterio.open(self.path) as src:
            self.assertIsNone(terrain.export_patch(src, self.site, "earth", grid=9))

    def test_partial_nodata_remains_null(self):
        values = np.ones((100, 100)) * 17
        values[:, :50] = -9999
        self.write(values)
        with rasterio.open(self.path) as src:
            asset = terrain.export_patch(src, self.site, "earth", grid=9)
        self.assertIn(None, asset["elevations"])
        self.assertIn(17, asset["elevations"])
        self.assertEqual(asset["minElevationM"], 17)

    def test_mars_uses_mars_radius_and_high_latitude_physical_size(self):
        self.write(np.ones((100, 100)) * -4000,
                   crs="+proj=eqc +R=3396190 +units=m",
                   affine=from_origin(-50000, 4030000, 1000, 1000))
        site = {**self.site, "planet": "mars", "lat": 68.0, "radius_km": 5}
        with rasterio.open(self.path) as src:
            asset = terrain.export_patch(src, site, "mars", grid=9)
        self.assertIsNotNone(asset)
        self.assertEqual(asset["sizeXM"], 10000)
        self.assertEqual(asset["sizeYM"], 10000)
        self.assertEqual(asset["minElevationM"], -4000)
        self.assertAlmostEqual(asset["source"]["resolutionM"], 1000, delta=2)

    def test_validation_rejects_missing_coords_and_unsafe_ids(self):
        for patch in [{"lat": None}, {"lon": 190}, {"id": "../elsewhere"}, {"lat": True}, {"planet": "mars"}]:
            self.assertFalse(terrain.valid_site({**self.site, **patch}, "earth"))
        self.assertTrue(terrain.valid_site(self.site, "earth"))

    def test_longitude_wraps_across_dateline(self):
        values = np.full((180, 360), 20.0)
        values[:, :180] = 10
        self.write(values, affine=from_origin(-180, 90, 1, 1))
        for longitude in (179.9, -179.9):
            site = {**self.site, "lon": longitude, "radius_km": 200}
            with rasterio.open(self.path) as src:
                asset = terrain.export_patch(src, site, "earth", grid=9)
            self.assertNotIn(None, asset["elevations"])
            self.assertEqual(asset["minElevationM"], 10)
            self.assertEqual(asset["maxElevationM"], 20)

    def test_grid_cap(self):
        self.write(np.ones((100, 100)))
        with rasterio.open(self.path) as src:
            with self.assertRaises(ValueError):
                terrain.export_patch(src, self.site, "earth", grid=257)


if __name__ == "__main__":
    unittest.main()
