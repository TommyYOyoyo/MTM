import rasterio
import numpy as np

MOLA = "data/raw/MOLA_463m.tif"
RADIUS = 3396190
PIXEL = 463.0935 # in meter

# latittude and longitude to xy
def coordsToXY(lat, lon):
    x = RADIUS * np.radians(lon)
    y = RADIUS * np.radians(lat)
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

# slope reading
def readSlope(src, lat, lon, radius_km=5):
    x, y = coordsToXY(lat, lon)
    row, col = src.index(x, y)
    
    # radius in pixel numbers
    n = int(round(radius_km*1000/PIXEL))
    
    patch = src.read(1, window=((row - n, row + n + 1), (col - n, col + n + 1))).astype(float)
    
    # put nan for all nodata
    patch[patch == src.nodata] = np.nan
    
    # height derivative, dzdy --> yAxis, dydx --> xAxis, globe latitude distortion fix for third param
    dz_dy, dz_dx = np.gradient(patch, PIXEL, PIXEL * np.cos(np.radians(lat))) # per pixel
    
    slope_deg = np.degrees(np.arctan(np.hypot(dz_dy, dz_dx)))
                    # slope              roughness (standard dev of slopes)
    return float(np.nanmean(slope_deg)), float(np.nanstd(slope_deg))

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
            siteRad = site["radius_km"]
            
            if siteLat is None or siteLon is None or siteRad is None:
                continue
            
            elevation = readPixel(src, siteLat, siteLon)
            slope = readSlope(src, siteLat, siteLon, radius_km = siteRad)
            results[site["id"]] = {"elevation_m" : elevation, "slope_deg" : slope[0], "roughness_deg": slope[1]}
        
    return results

if __name__ == "__main__":
    tests = [
        {"id": "gale",          "planet": "mars", "lat": -4.589467, "lon": 137.441633, "radius_km": 5},
        {"id": "olympus_mons",  "planet": "mars", "lat": 18.65,     "lon": -133.8, "radius_km": 5},     
        {"id": "no_coords",     "planet": "mars", "lat": None,      "lon": None, "radius_km": 40},      
        {"id": "atacama",       "planet": "earth", "lat": -24.5,    "lon": -69.25, "radius_km": 40},     
    ]
    
    print(measure(tests))
    
    
# convert lat/lon to xy
