import rasterio
import numpy as np
import pandas as pd
import ee
import mars, earth, normalize
import json

SITES_CSV = "pipeline/data/sites_input.csv" 
OUT_JSON = "web/public/sites.json"
NUMERIC = ["lat", "lon", "radius_km"]

# Auth
#ee.Authenticate()

def splitList(text, separator="|"):
    return [item.strip() for item in text.split(separator) if item.strip()] if text else []

def load_sites(path):
    df = pd.read_csv(path, encoding="utf-8-sig")
    
    # drop empty
    df = df.dropna(subset=["id"])
    
    # str to numeric
    for col in NUMERIC:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # nan to none for json no err
    df = df.replace({ np.nan : None})
    
    sites = df.to_dict(orient="records")
    
    for site in sites:
        if site["tags"]:
            site["tags"] = [tag.strip() for tag in site["tags"].split(",")]  # split string of tags to list
        else:
            site["tags"] = []
     
    return sites

def main():
    # init
    ee.Initialize(project="tokyovps-431503")
    sites = load_sites(SITES_CSV)
    
    marsRaw = mars.measure(sites)
    earthRaw = earth.measure(sites)
                             
    rawBySite = { **marsRaw, **earthRaw }
    
    # normalize to 0-1
    normalizedBySite = normalize.normalize(sites, rawBySite)
    
    for site in sites:
        site["raw"] = rawBySite.get(site["id"], {})
        site["n"] = normalizedBySite[site["id"]]
        site["benchmark"] = site.get("benchmark") == "yes"
        site["papers"] = splitList(site.get("papers"), ";")
        
    with open(OUT_JSON, "w", encoding="utf-8") as outFile:
        json.dump(sites, outFile, indent=2, ensure_ascii=False)
    
    print(f"done wirting {len(sites)} sites to {OUT_JSON}")
    
if __name__ == "__main__":
    main()