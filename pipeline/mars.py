import rasterio
import numpy as np

MOLA = "data/raw/MOLA_463m.tif"

R = 3396190

# latittude and longitude to xy
def coordsToXY(lat, lon):
    x = R * np.radians(lon)
    y = R * np.radians(lat)
    return x, y 

# read map pixel value
def readPixel(src, lat, lon):
    
    x, y = coordsToXY(lat, lon)
    row, col = src.index(x, y)
    
    # load pixel value
    value = int(src.read(1, window=((row, row+1), (col, col+1)))[0][0])
    
    if value == src.nodata:
        return None
    
    return value

# measurement for each site of mars 
def measure(sites):
    results = {}

    with rasterio.open(MOLA) as src:
        for site in sites:
            # prevent using earth data
            if site.get("planet") != "mars":
                continue

            siteLat = site["lat"]
            siteLon = site["lon"]
            
            if siteLat is None or siteLon is None:
                continue
            
            elevation = readPixel(src, siteLat, siteLon)
            results[site["id"]] = {"elevation_m" : elevation}
        
    return results

if __name__ == "__main__":
    tests = [
        {"id": "gale",          "planet": "mars", "lat": -4.589467, "lon": 137.441633},  # expect ≈ -4501
        {"id": "olympus_mons",  "planet": "mars", "lat": 18.65,     "lon": -133.8},      # expect ≈ +21000
        {"id": "no_coords",     "planet": "mars", "lat": None,      "lon": None},        # expect skipped
        {"id": "atacama",       "planet": "earth", "lat": -24.5,    "lon": -69.25},      # expect skipped (Earth site)
    ]
    
    print(measure(tests))
    
    
# convert lat/lon to xy
