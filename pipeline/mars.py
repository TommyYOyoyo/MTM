import rasterio
import numpy as np

MOLA = "data/raw/MOLA_463m.tif" # surface slope/roughness
TES_ALBEDO = "data/raw/TES_albedo_7410m.tif"
SWIM = "data/raw/SWIM2_c0_1.tif" # subsurface water
TI = "data/raw/global_ti_night_2007.img" # thernal inertia
TI_PPD = 20 # res = 20pixels/deg

RADIUS_MOLA = 3396190
RADIUS_TES = 3396000
PIXEL = 463.0935 # in meter

def loadTI():
    # big embian int16 --> 3600 rows and 7200 cols 
    return np.fromfile(TI, dtype=">i2").reshape(3600, 7200)

# latittude and longitude to xy
def coordsToXY(lat, lon, radius=RADIUS_MOLA):
    x = radius * np.radians(lon)
    y = radius * np.radians(lat)
    return x, y 

# read map pixel value
def readPixel(src, lat, lon):
    x, y = coordsToXY(lat, lon)
    row, col = src.index(x, y)
    
    # load pixel value
    value = int(src.read(1, window=((row, row+1), (col, col+1)))[0, 0])
    
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

# albedo reading
def readAlbedo(src, lat, lon):
    x, y = coordsToXY(lat, lon, RADIUS_TES)
    row, col = src.index(x, y)
    
    value = float(src.read(1, window=((row, row+1), (col, col+1)))[0, 0])
    
    if value <= -1e30 or np.isnan(value): #nodat
        return None
    
    return round(value, 4)

# subsuface water reading
def readSwim(src, lat, lon, radius_km=5):
    x, y = coordsToXY(lat, lon, RADIUS_MOLA)
    
    bound = src.bounds
    if not (bound.left <= x <= bound.right and bound.bottom <= y <= bound.top): # outside data coverage 
        return None
    
    row, col = src.index(x, y)
    
    n = max(1, int(round(radius_km * 1000 / src.res[0]))) # pixels fitting in radius, always >=1
    patch = src.read(1, window=((row - n, row + n + 1), (col - n, col + n + 1))).astype(float)
    
    patch[patch <= -99] = np.nan # nodata = -100
    
    if np.all(np.isnan(patch)):
        return None
    
    return round(float(np.nanmean(patch)), 3)

# thermal inertia
def readTI(ti, lat, lon, radius_km=5):
    row = int((90 - lat) * TI_PPD)
    col = int((lon + 180) * TI_PPD)
    
    n = max(1, int(round(radius_km / 2.96)))
    
    # squres of pixels w/ delim
    patch = ti[max(row - n, 0):row+n+1, max(col - n, 0):col + n + 1].astype(float)
    
    patch[patch <= 0] = np.nan
    
    # all pixels = missing
    if np.all(np.isnan(patch)):
        return None
    
    return round(float(np.nanmean(patch)), 1)
    

# measurement for each site of mars 
def measure(sites):
    results = {}
    
    ti = loadTI()

    with rasterio.open(MOLA) as src, rasterio.open(TES_ALBEDO) as alb, rasterio.open(SWIM) as swim:
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
            albedo = readAlbedo(alb, siteLat, siteLon)
            subsurf_water = readSwim(swim, siteLat, siteLon, siteRad)
            ti_val = readTI(ti, siteLat, siteLon, siteRad)
            
            # FINALIZED DATA HERE!! MY SANITY IS ALSO FINALIZED :)
            results[site["id"]] = {"elevation_m" : elevation, "slope_deg" : slope[0], "roughness_deg": slope[1], "albedo": albedo, "subsurf_water": subsurf_water, "ti": ti_val}
        
    return results

if __name__ == "__main__":
    tests = [
        {"id": "gale",          "planet": "mars", "lat": -4.589467, "lon": 137.441633, "radius_km": 5},
        {"id": "olympus_mons",  "planet": "mars", "lat": 18.65,     "lon": -133.8, "radius_km": 5},     
        {"id": "no_coords",     "planet": "mars", "lat": None,      "lon": None, "radius_km": 40},      
        {"id": "atacama",       "planet": "earth", "lat": -24.5,    "lon": -69.25, "radius_km": 40},     
    ]
    
    print(measure(tests))
    
