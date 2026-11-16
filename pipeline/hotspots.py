# GROUP DISCOVERY CANDIDATES INTO HOTSPOT REGIONS W/ DBSCAN (ML) --> ADDS "hotspot" TO DISCOVERY.JSON

import json
import numpy as np
from sklearn.cluster import DBSCAN

DISCOVERY_JSON = "web/public/discovery.json"
EARTH_RADIUS_KM = 6371.0
MAX_GAP_KM = 250 # points closer than this can be in the same hotspot
MIN_POINTS = 4 # a hotspot needs at least this many candidates

# 14.2, 40.3 --> "14.2°N, 40.3°E"
def coordLabel(lat, lon):
    ns = "N" if lat >= 0 else "S"
    ew = "E" if lon >= 0 else "W"
    return str(round(abs(lat), 1)) + "°" + ns + ", " + str(round(abs(lon), 1)) + "°" + ew

def main():
    with open(DISCOVERY_JSON, encoding="utf-8") as dataFile:
        data = json.load(dataFile)

    sites = data["sites"]
    coords = np.radians([[site["lat"], site["lon"]] for site in sites])

    # haversine = distance on a sphere, so eps is an angle: km / earth radius
    labels = DBSCAN(eps=MAX_GAP_KM / EARTH_RADIUS_KM, min_samples=MIN_POINTS, metric="haversine").fit_predict(coords)

    # biggest hotspot = number 1
    found = sorted(set(labels) - {-1}, key=lambda l: -int(np.sum(labels == l))) # -1 = isolated point, no hotspot

    hotspots = []
    byLabel = {}
    for rank, label in enumerate(found, start=1):
        members = [site for site, l in zip(sites, labels) if l == label]
        lat = float(np.mean([site["lat"] for site in members]))
        lon = float(np.mean([site["lon"] for site in members]))
        hotspot = {"id": "hotspot_" + str(rank), "label": "Hotspot " + str(rank) + " · " + coordLabel(lat, lon), "lat": round(lat, 3), "lon": round(lon, 3), "count": len(members)}
        hotspots.append(hotspot)
        byLabel[label] = hotspot

    for site, label in zip(sites, labels):
        site["hotspot"] = byLabel[label]["label"] if label in byLabel else None
    data["metadata"]["hotspots"] = hotspots
    data["metadata"]["hotspot_method"] = "DBSCAN (haversine), max gap " + str(MAX_GAP_KM) + " km, at least " + str(MIN_POINTS) + " candidates"

    with open(DISCOVERY_JSON, "w", encoding="utf-8") as outFile:
        json.dump(data, outFile, indent=1)

    clustered = sum(1 for l in labels if l != -1)
    print(len(hotspots), "hotspots |", clustered, "of", len(sites), "candidates grouped")
    for h in hotspots[:8]:
        print(" ", h["label"], "-", h["count"], "candidates")

if __name__ == "__main__":
    main()
