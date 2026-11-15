import ee

SCALE = 463.0935
START, END = "2023-01-01", "2024-01-01"

# dem = digital elevation map
# pick the right elevatoin map
def demFor(lat):
    if -56 <= lat <= 60: #nasa coverage only in 56-60 lat
        return ee.Image("NASA/NASADEM_HGT/001").select("elevation"), "NASADEM" 
    col = ee.ImageCollection("COPERNICUS/DEM/GLO30_2024_1").select("DEM")
    return col.mosaic().setDefaultProjection(col.first().projection()), "Copernicus GLO-30"

def measure(sites):
    albedo = (ee.ImageCollection("MODIS/061/MCD43A3")).filterDate(START, END).select("Albedo_WSA_shortwave").mean().multiply(0.001)
    # lst = land surface temp
    lst = ee.ImageCollection("MODIS/061/MOD11A2").filterDate(START, END)
    # avg all 2023 day & night readings
    temps = (lst.select("LST_Day_1km").mean().multiply(0.02).rename("day").addBands(lst.select("LST_Night_1km").mean().multiply(0.02).rename("night")))
    
    results = {}
    for site in sites:
        if site.get("planet") != "earth" or site.get("lat") is None or site.get("lon") is None:
            continue
        
        lat, lon = site["lat"], site["lon"]

        # like patch in mars
        area = ee.Geometry.Point([lon, lat]).buffer(5000)
        
        dem, demName = demFor(lat)
        
        # apply same scale (463m) as mars instead of hte more precise earth 30m
        dem463 = dem.reduceResolution(ee.Reducer.mean(), maxPixels=1024).reproject(crs="EPSG:4326", scale=SCALE)
        
        slope = ee.Terrain.slope(dem463) #steepness / pix
 
        # give avg slope & standard dev inside area in one go
        slopeStats = slope.reduceRegion(ee.Reducer.mean().combine(ee.Reducer.stdDev(), sharedInputs=True), area, scale=SCALE, maxPixels=1e8).getInfo()      
        albedoStats = albedo.reduceRegion(ee.Reducer.mean(), area, scale=1000, maxPixels=1e8).getInfo() # avg brightness in area
        tempStats = temps.reduceRegion(ee.Reducer.mean(), area, scale=1000, maxPixels=1e8).getInfo() # avg temp in area
        
        alb, day, night = albedoStats.get("Albedo_WSA_shortwave"), tempStats.get("day"), tempStats.get("night")
        
        # how much ground warms night --> day
        dT = day - night if day is not None and night is not None else None
        
        # apparent thermal inertia
        apparent_ti = (1 - alb) / dT
        
        results[site["id"]] = {
            "slope_deg": slopeStats.get("slope_mean"),
            "roughness_deg": slopeStats.get("slope_stdDev"),
            "albedo": alb, "lst_day_k": day, "lst_night_k": night, "dT_k": dT,
            "apparent_ti": apparent_ti, "dem": demName,
        }
        
    return results
    
if __name__ == "__main__":
    ee.Initialize(project="tokyovps-431503")
    tests = [
        {"id": "yungay", "planet": "earth", "lat": -24.0884, "lon": -69.9945, "radius_km": 5},
        {"id": "haughton", "planet": "earth", "lat": 75.38, "lon": -89.67, "radius_km": 5},
        {"id": "gale", "planet": "mars", "lat": -4.59, "lon": 137.44, "radius_km": 5},   # should be skipped
    ]
    print(measure(tests))
