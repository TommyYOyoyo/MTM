# GLOBAL SCAN: sample random land points on Earth, measure them like earth.py, write web/public/discovery.json
# The app ranks these candidates live against the chosen Mars site (Discovery tab).
import json, random, sys, time
import ee

OUT_JSON = "web/public/discovery.json"
CHUNKS = 12          # 12 x 500 random points -> ~1,600 land points
PER_CHUNK = 500
SEED = 42
SCALE = 463.0935     # same grid as Mars MOLA
TILT_EARTH = 23.4
MAX_NDVI = 0.2       # vegetated land is not a Mars analog
MAX_WATER = 0.05     # lakes / rivers / coast within 5 km are excluded


def buildStack():
    # same layers as earth.py, but as one image so a whole batch of points is read in one request
    dem = ee.Image("NASA/NASADEM_HGT/001").select("elevation")
    dem463 = dem.reduceResolution(ee.Reducer.mean(), maxPixels=1024).reproject(crs="EPSG:4326", scale=SCALE)
    slope = ee.Terrain.slope(dem463)
    circle = ee.Kernel.circle(5000, "meters")   # 5 km radius, like the sites
    slopeStats = slope.reduceNeighborhood(ee.Reducer.mean().combine(ee.Reducer.stdDev(), sharedInputs=True), circle)

    year = ("2023-01-01", "2024-01-01")
    albedo = ee.ImageCollection("MODIS/061/MCD43A3").filterDate(*year).select("Albedo_WSA_shortwave").mean().multiply(0.001).rename("albedo")
    lst = ee.ImageCollection("MODIS/061/MOD11A2").filterDate(*year)
    day = lst.select("LST_Day_1km").mean().multiply(0.02).rename("day")
    night = lst.select("LST_Night_1km").mean().multiply(0.02).rename("night")
    ndvi = ee.ImageCollection("MODIS/061/MOD13A2").filterDate(*year).select("NDVI").mean().multiply(0.0001).rename("ndvi")
    water = ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select("occurrence").unmask(0).gt(5)
    waterFrac = water.reduceNeighborhood(ee.Reducer.mean(), circle).rename("water_frac")
    return slopeStats.addBands([albedo, day, night, ndvi, waterFrac])


def samplePoints(stack):
    rng = random.Random(SEED)
    points = []
    for chunk in range(CHUNKS):
        start = time.time()
        batch = ee.FeatureCollection([ee.Feature(ee.Geometry.Point([rng.uniform(-180, 180), rng.uniform(-56, 60)]))
                                      for _ in range(PER_CHUNK)])   # NASADEM covers 56S-60N
        try:
            features = stack.sampleRegions(collection=batch, scale=1000, geometries=True, tileScale=4).getInfo()["features"]
        except Exception as error:
            print(f"chunk {chunk} failed: {error}")
            continue
        for feature in features:
            props = feature["properties"]
            props["lon"], props["lat"] = feature["geometry"]["coordinates"]
            points.append(props)
        print(f"chunk {chunk}: {len(points)} land points so far ({time.time() - start:.0f}s)")
    return points


def keepBarren(points):
    needed = ("slope_mean", "slope_stdDev", "albedo", "day", "night", "ndvi", "water_frac")
    return [p for p in points
            if all(p.get(k) is not None for k in needed)
            and p["ndvi"] <= MAX_NDVI and p["water_frac"] <= MAX_WATER]


def toSites(points):
    # apparent thermal inertia, ranked within the scan (same "rank within planet" idea as normalize.py)
    for p in points:
        dT = p["day"] - p["night"]
        p["ati"] = (1 - p["albedo"]) / dT if dT > 0.5 else None
    ranked = sorted((p["ati"], i) for i, p in enumerate(points) if p["ati"] is not None)
    for position, (_, i) in enumerate(ranked):
        points[i]["thermal_n"] = position / (len(ranked) - 1)

    sites = []
    for i, p in enumerate(points):
        lat, lon = round(p["lat"], 4), round(p["lon"], 4)
        sites.append({
            "id": f"scan_{i:04d}",
            "name": f"Scan candidate {lat:.2f}, {lon:.2f}",
            "planet": "earth", "type": "scan_candidate", "lat": lat, "lon": lon, "radius_km": 5,
            "ice": None, "tags": [], "subsurface": None, "benchmark": False, "discovery": True,
            "raw": {"slope_deg": round(p["slope_mean"], 2), "roughness_deg": round(p["slope_stdDev"], 2),
                    "albedo": round(p["albedo"], 3), "lst_day_k": round(p["day"], 1), "lst_night_k": round(p["night"], 1),
                    "apparent_ti": p["ati"], "ndvi": round(p["ndvi"], 2), "water_frac": round(p["water_frac"], 3)},
            "n": {"slope": min(1.0, p["slope_mean"] / 30), "roughness": min(1.0, p["slope_stdDev"] / 15),
                  "thermal": p.get("thermal_n"), "albedo": min(1.0, max(0.0, p["albedo"])),
                  "sun": round(min(90, 90 - abs(lat) + TILT_EARTH) / 90, 3)},
            "notes": "Unreviewed global-scan candidate: terrain/thermal/albedo match only; geology and ice not verified.",
        })
    return sites


def main(outPath=OUT_JSON):
    ee.Initialize(project="tokyovps-431503")
    points = samplePoints(buildStack())
    barren = keepBarren(points)
    sites = toSites(barren)
    output = {"metadata": {"status": "connected", "method": "Random global sample of land points (56S-60N), 5 km radius, NASADEM + MODIS + JRC water mask; vegetated (NDVI>0.2) and wet (>5% water) points removed", "sampled_land_points": len(points), "candidates": len(sites), "sources": ["NASA/NASADEM_HGT/001", "MODIS/061/MCD43A3", "MODIS/061/MOD11A2", "MODIS/061/MOD13A2", "JRC/GSW1_4/GlobalSurfaceWater"]},
              "sites": sites}
    with open(outPath, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=1)
    print(f"wrote {len(sites)} candidates (from {len(points)} land points) to {outPath}")


if __name__ == "__main__":
    main(*sys.argv[1:])