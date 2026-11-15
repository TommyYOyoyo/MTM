#!/usr/bin/env python3
"""Build a local Web Mercator tile pyramid from a 2:1 global image.

Install Pillow first, then run once for each planet. The source files stay outside
the web app; the generated JPEG tiles are what the globe loads progressively.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import math
from pathlib import Path
import shutil
import tempfile

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TILE_ROOT = ROOT / 'web' / 'public' / 'textures' / 'tiles'
TILE_SIZE = 512
STRIP_SIZE = 16
Image.MAX_IMAGE_PIXELS = 400_000_000


def source_y(mercator_y: float, height: int) -> float:
    latitude = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * mercator_y))))
    return (90 - latitude) / 180 * height


def make_tile(image: Image.Image, level: int, x: int, y: int, destination: Path) -> None:
    grid = 1 << level
    x0, x1 = x * image.width / grid, (x + 1) * image.width / grid
    mesh = []
    for top in range(0, TILE_SIZE, STRIP_SIZE):
        bottom = min(top + STRIP_SIZE, TILE_SIZE)
        y0 = source_y((y + top / TILE_SIZE) / grid, image.height)
        y1 = source_y((y + bottom / TILE_SIZE) / grid, image.height)
        mesh.append(((0, top, TILE_SIZE, bottom), (x0, y0, x0, y1, x1, y1, x1, y0)))
    tile = image.transform((TILE_SIZE, TILE_SIZE), Image.Transform.MESH, mesh, Image.Resampling.BILINEAR)
    path = destination / str(level) / str(x) / f'{y}.jpg'
    path.parent.mkdir(parents=True, exist_ok=True)
    tile.save(path, 'JPEG', quality=82, subsampling=0)


def build(source: Path, planet: str, output: Path, max_level: int, workers: int) -> None:
    output.mkdir(parents=True, exist_ok=True)
    final = output / planet
    if final.exists():
        raise FileExistsError(f'{final} already exists; move it aside before regenerating.')
    staging_root = ROOT / 'data' / 'raw' / 'globe-tile-staging'
    staging_root.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f'.{planet}-', dir=staging_root))
    try:
        with Image.open(source) as opened:
            if opened.width != 2 * opened.height:
                raise ValueError('Expected a global 2:1 equirectangular image.')
            image = opened.convert('RGB')
        width, height = image.size
        for level in range(max_level + 1):
            grid = 1 << level
            desired_width = min(width, TILE_SIZE * grid)
            # Downsample before reprojection to avoid aliasing at low zoom.
            level_image = image if desired_width == width else image.resize((desired_width, desired_width // 2), Image.Resampling.LANCZOS)
            print(f'{planet}: building zoom {level} ({grid * grid} tiles)', flush=True)
            with ThreadPoolExecutor(max_workers=workers) as executor:
                futures = [executor.submit(make_tile, level_image, level, x, y, staging)
                           for x in range(grid) for y in range(grid)]
                for future in futures:
                    future.result()
            if level_image is not image:
                level_image.close()
        image.close()
        shutil.move(str(staging), str(final))
        manifest_path = output / 'manifest.json'
        manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {'planets': {}}
        manifest['planets'][planet] = {'maxLevel': max_level, 'tileSize': TILE_SIZE, 'sourceWidth': width, 'sourceHeight': height}
        with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=output, delete=False) as handle:
            json.dump(manifest, handle, indent=2)
            handle.write('\n')
            temp_manifest = Path(handle.name)
        temp_manifest.replace(manifest_path)
    finally:
        if staging.exists():
            shutil.rmtree(staging)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('planet', choices=['earth', 'mars'])
    parser.add_argument('source', type=Path)
    parser.add_argument('--output', type=Path, default=TILE_ROOT)
    parser.add_argument('--max-level', type=int, default=6, choices=range(0, 7))
    parser.add_argument('--workers', type=int, default=2, choices=range(1, 9))
    args = parser.parse_args()
    build(args.source, args.planet, args.output, args.max_level, args.workers)


if __name__ == '__main__':
    main()
