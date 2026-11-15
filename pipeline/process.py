import rasterio
import numpy as np
import pandas as pd
import ee
import csv

print(rasterio.__version__)

SITES_CSV = "pipeline/data/sites_input.csv" 
OUT_JSON = "web/public/sites.json"
NUMERIC = ["lat", "lon", "radius_km"]

# Auth
#ee.Authenticate()

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
    
    # TODO: for each Mars site -> mars.measure(site) 
    # TODO: for each Earth site -> earth_gee.measure(sites) 
    # TODO: normalize.add_n_values(sites)     
    # TODO: write OUT_JSON in the agreed schema
    
if __name__ == "__main__":
    main()