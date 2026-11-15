# CONVERT EVERYTHING TO 0-1 FOR SCORING.JS

AXIAL_TILT = {"mars": 25.2, "earth": 23.4} # tilt in deg  
SLOPE_MAX = 30 # >=30 steepness --> 1.0
ROUGH_MAX = 15 # >= 15 roughness --> 1.0
POLAR_LAT = 60 # >=60 dT 

def clipTo01(value):
    # clip everything to 0->1
    return None if value is None else max(0.0, min(1.0, float(value))) # max limits the lower, min limits the upper

# highest noon sun angle over the year
def sunScore(lat, planet): 
    return min(90, 90-abs(lat) + AXIAL_TILT[planet]) / 90

# sort planet thermal values from low to high & give each site position as [0, 1] in percentiles where <2 --> 0.5 (no comparison possible)
def percentileRanks(valueBySite):
    validPairs = sorted((value, siteId) for siteId, value in valueBySite.items() if value is not None) # eliminate null pairs
    
    # only 2 valid pairs so nothing to compare with so 0.5 ea
    if len(validPairs) < 2:
        return { siteId: (0.5 if value is not None else None) for siteId, value in valueBySite.items() }
    
    rankBySite = { siteId: None for siteId in valueBySite }
        
    for position, (value, siteId) in enumerate(validPairs):
        rankBySite[siteId] = position / (len(validPairs) - 1)
    
    return rankBySite
            
# select right thermal measurement per planet
def rawThermal(site, measurements):
    # earth = ati 
    if site["planet"] == "mars":
        return measurements.get("ti")
    
    if abs(site["lat"]) > POLAR_LAT:
        return None 
    
    # earth = ati using MODIS
    return measurements.get("apparent_ti")

def normalize(sites, rawBySite):
    thermalRankBySite = {}
    
    for planet in ("mars", "earth"):
        thermalBySite = { site["id"]: rawThermal(site, rawBySite.get(site["id"], {})) for site in sites if site["planet"] == planet and site.get("lat") is not None}
        
        thermalRankBySite.update(percentileRanks(thermalBySite)) # sites in each planet ranked internally
        
    normalizedBySite = {}

    for site in sites:
        measurements = rawBySite.get(site["id"], {}) 
        slopeDeg = measurements.get("slope_deg")
        roughnessDeg = measurements.get("roughness_deg")
        hasCoords = site.get("lat") is not None
        
        normalizedBySite[site["id"]] = {
            "slope": clipTo01(slopeDeg / SLOPE_MAX) if slopeDeg is not None else None,
            "roughness": clipTo01(roughnessDeg / ROUGH_MAX) if roughnessDeg is not None else None,
            "thermal": thermalRankBySite.get(site["id"]),
            "albedo": clipTo01(measurements.get("albedo")),
            "sun": clipTo01(round(sunScore(site["lat"], site["planet"]), 3)) if hasCoords else None,
        }
    
    return normalizedBySite
        

        
if __name__ == "__main__":
    testSites = [
        {"id": "gale", "planet": "mars", "lat": -4.59},
        {"id": "olympus_mons", "planet": "mars", "lat": 18.65},
        {"id": "yungay", "planet": "earth", "lat": -24.09},
        {"id": "haughton", "planet": "earth", "lat": 75.38},
        {"id": "arcadia", "planet": "mars", "lat": None},
    ]
    testRaw = {
        "gale": {"slope_deg": 1.64, "roughness_deg": 2.09, "albedo": 0.2313, "ti": 364.4},
        "olympus_mons": {"slope_deg": 3.43, "roughness_deg": 6.11, "albedo": 0.2996, "ti": 112.5},
        "yungay": {"slope_deg": 3.64, "roughness_deg": 2.59, "albedo": 0.245, "apparent_ti": 0.024},
        "haughton": {"slope_deg": 2.79, "roughness_deg": 2.33, "albedo": 0.564, "apparent_ti": 0.155},
    }
    for siteId, normalizedValues in normalize(testSites, testRaw).items():
        print(siteId, normalizedValues)
        

    
 
