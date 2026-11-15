"""Checks projection and tile coverage using a synthetic longitude/latitude map."""
import json
from pathlib import Path
import tempfile
import unittest

from PIL import Image

from scripts.build_globe_tiles import build, source_y


class GlobeTilesTest(unittest.TestCase):
    def test_projection_and_pyramid(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'source.png'
            image = Image.new('RGB', (512, 256))
            image.putdata([(x // 2, y, 0) for y in range(256) for x in range(512)])
            image.save(source)
            image.close()

            output = root / 'tiles'
            build(source, 'earth', output, max_level=1, workers=1)
            manifest = json.loads((output / 'manifest.json').read_text())
            self.assertEqual(manifest['planets']['earth']['maxLevel'], 1)
            self.assertEqual(len(list((output / 'earth').rglob('*.jpg'))), 5)

            # Center of upper-left tile is 90° W and ~66.5° N.
            with Image.open(output / 'earth' / '1' / '0' / '0.jpg') as tile:
                red, green, _ = tile.getpixel((256, 256))
            self.assertAlmostEqual(red, 64, delta=3)
            self.assertAlmostEqual(green, source_y(0.25, 256), delta=3)
            self.assertAlmostEqual(source_y(0.5, 256), 128)


if __name__ == '__main__':
    unittest.main()
