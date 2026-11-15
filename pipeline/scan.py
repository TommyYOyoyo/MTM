# GLOBAL SCAN: RANDOM POINTS ON EARTH LAND --> MEASURE LIKE EARTH.PY --> DISCOVERY.JSON FOR THE DISCOVERY TAB

import json
import random
import time
import ee

OUT_JSON = "web/public/discovery.json"
CHUNKS = 12 # 12 x 500 points, ~1700 land after ocean removed
PER_CHUNK = 500
SCALE = 463.0935 # same res as mars mola
TILT_EARTH = 23.4
MAX_NDVI = 0.2 # > 0.2 = plants --> not mars like
MAX_WATER = 0.05 # > 5% water in 5km --> lake/river/coast

# all earth layers in 1 image so 500 points = 1 request (fast)
def buildStack():
    dem = ee.Image("NASA/NASADEM_HGT/001").select("elevation")
    dem463 = dem.reduceResolution(ee.Reducer.mean(), maxPixels=1024).reproject(crs="EPSG:4326", scale=SCALE)
    slope = ee.Terrain.slope(dem463)

    circle = ee.Kernel.circle(5000, "meters") # 5km radius like the sites
    slopeStats = slope.reduceNeighborhood(ee.Reducer.mean().combine(ee.Reducer.stdDev(), sharedInputs=True), circle)

    albedo = ee.ImageCollection("MODIS/061/MCD43A3").filterDate("2023-01-01", "2024-01-01").select("Albedo_WSA_shortwave").mean().multiply(0.001).rename("albedo")

    lst = ee.ImageCollection("MODIS/061/MOD11A2").filterDate("2023-01-01", "2024-01-01")
    day = lst.select("LST_Day_1km").mean().multiply(0.02).rename("day")
    night = lst.select("LST_Night_1km").mean().multiply(0.02).rename("night")

    ndvi = ee.ImageCollection("MODIS/061/MOD13A2").filterDate("2023-01-01", "2024-01-01").select("NDVI").mean().multiply(0.0001).rename("ndvi")

    # share of water in the 5km circle
    water = ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select("occurrence").unmask(0).gt(5)
    waterFrac = water.reduceNeighborhood(ee.Reducer.mean(), circle).rename("water_frac")

    return slopeStats.addBands([albedo, day, night, ndvi, waterFrac])

# throw random points between 56S and 60N (nasadem coverage), ocean points come back empty
def samplePoints(stack):
    rng = random.Random(42)
    points = []

    for chunk in range(CHUNKS):
        start = time.time()

        batch = []
        for i in range(PER_CHUNK):
            lon = rng.uniform(-180, 180)
            lat = rng.uniform(-56, 60)
            batch.append(ee.Feature(ee.Geometry.Point([lon, lat])))

        try:
            features = stack.sampleRegions(collection=ee.FeatureCollection(batch), scale=1000, geometries=True, tileScale=4).getInfo()["features"]
        except Exception as error:
            print("chunk", chunk, "failed:", error)
            continue

        for feature in features:
            point = feature["properties"]
            point["lon"], point["lat"] = feature["geometry"]["coordinates"]
            points.append(point)

        print("chunk", chunk, ":", len(points), "land points |", round(time.time() - start), "s")

    return points

# keep dry bare ground only
def keepBarren(points):
    needed = ["slope_mean", "slope_stdDev", "albedo", "day", "night", "ndvi", "water_frac"]
    barren = []

    for point in points:
        if any(point.get(key) is None for key in needed):
            continue
        if point["ndvi"] > MAX_NDVI or point["water_frac"] > MAX_WATER:
            continue
        barren.append(point)

    return barren

# same 0-1 rules as normalize.py
def toSites(points):
    # apparent thermal inertia, then rank inside the scan (like percentileRanks)
    for point in points:
        dT = point["day"] - point["night"]
        point["ati"] = (1 - point["albedo"]) / dT if dT > 0.5 else None

    validPairs = sorted((point["ati"], i) for i, point in enumerate(points) if point["ati"] is not None)
    for position, (value, i) in enumerate(validPairs):
        points[i]["thermal_n"] = position / (len(validPairs) - 1)

    sites = []
    for i, point in enumerate(points):
        lat = round(point["lat"], 4)
        lon = round(point["lon"], 4)

        sites.append({
            "id": "scan_" + str(i).zfill(4),
            "name": "Scan candidate " + str(round(lat, 2)) + ", " + str(round(lon, 2)),
            "planet": "earth", "type": "scan_candidate",
            "lat": lat, "lon": lon, "radius_km": 5,
            "ice": None, "tags": [], "subsurface": None, # unknown --> skipped in scoring
            "benchmark": False, "discovery": True,
            "raw": {
                "slope_deg": round(point["slope_mean"], 2), "roughness_deg": round(point["slope_stdDev"], 2),
                "albedo": round(point["albedo"], 3), "lst_day_k": round(point["day"], 1), "lst_night_k": round(point["night"], 1),
                "apparent_ti": point["ati"], "ndvi": round(point["ndvi"], 2), "water_frac": round(point["water_frac"], 3),
            },
            "n": {
                "slope": min(1.0, point["slope_mean"] / 30),
                "roughness": min(1.0, point["slope_stdDev"] / 15),
                "thermal": point.get("thermal_n"),
                "albedo": min(1.0, max(0.0, point["albedo"])),
                "sun": round(min(90, 90 - abs(lat) + TILT_EARTH) / 90, 3),
            },
            "notes": "Unreviewed scan candidate: terrain/thermal/albedo only, geology and ice not checked.",
        })

    return sites

def main():
    ee.Initialize(project="tokyovps-431503")

    points = samplePoints(buildStack())
    barren = keepBarren(points)
    sites = toSites(barren)

    output = {
        "metadata": {
            "status": "connected",
            "method": "Random land points 56S-60N, 5 km radius, NASADEM + MODIS + JRC water; NDVI > 0.2 and > 5% water removed",
            "sampled_land_points": len(points), "candidates": len(sites),
            "sources": ["NASA/NASADEM_HGT/001", "MODIS/061/MCD43A3", "MODIS/061/MOD11A2", "MODIS/061/MOD13A2", "JRC/GSW1_4/GlobalSurfaceWater"],
        },
        "sites": sites,
    }

    with open(OUT_JSON, "w", encoding="utf-8") as outFile:
        json.dump(output, outFile, indent=1)

    print("done writing", len(sites), "candidates from", len(points), "land points to", OUT_JSON)

if __name__ == "__main__":
    main()