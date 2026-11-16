# PHOENIX MET (CSA PARTNER DATA) --> SUMMARY OF REAL MARS WEATHER AT THE PHOENIX SITE --> PARTNER-OBSERVATIONS.JSON

import glob
import json
import re
import numpy as np

MET_DIR = "data/raw/phoenix_met"
OUT_JSON = "web/public/partner-observations.json"
SOURCE_URL = "https://donnees-data.asc-csa.gc.ca/dataset/0e338f52-25e4-465c-8104-bb9d7c8d3df3"

# RMC = one table per sol: seconds, pressure (Pa), temps at 250/500/1000 mm (K), reference temp (K); -1 = missing
def readSol(path):
    table = np.loadtxt(path, delimiter=",", ndmin=2)
    table[table <= 0] = np.nan # -1 = no data

    pressure = table[:, 1]
    air = table[:, 4] # sensor 1 m above the deck
    return pressure, air

# sol number from the label next to the table
def solNumber(csvPath):
    label = csvPath.replace(".TAB.csv", ".LBL")
    try:
        text = open(label, encoding="latin-1").read()
        found = re.search(r"PLANET_DAY_NUMBER\s*=\s*(\d+)", text)
        return int(found.group(1)) if found else None
    except OSError:
        return None

def main():
    files = sorted(glob.glob(MET_DIR + "/*/*/*RMC_*.TAB.csv"))

    sols = {}
    for path in files:
        sol = solNumber(path)
        pressure, air = readSol(path)
        if sol is None or np.all(np.isnan(air)):
            continue

        sols[sol] = {
            "pressure_mean": float(np.nanmean(pressure)) if not np.all(np.isnan(pressure)) else None,
            "air_min": float(np.nanmin(air)),
            "air_max": float(np.nanmax(air)),
        }

    days = sorted(sols)
    pressures = [sols[d]["pressure_mean"] for d in days if sols[d]["pressure_mean"] is not None]
    lows = [sols[d]["air_min"] for d in days]
    highs = [sols[d]["air_max"] for d in days]
    swings = [h - l for h, l in zip(highs, lows)]

    measurements = [
        {"label": f"Sols with data (sol {days[0]}–{days[-1]})", "value": len(days), "unit": ""},
        {"label": "Mean surface pressure", "value": round(float(np.mean(pressures)), 1), "unit": "Pa"},
        {"label": "Lowest daily-mean pressure", "value": round(min(pressures)), "unit": "Pa"},
        {"label": "Highest daily-mean pressure", "value": round(max(pressures)), "unit": "Pa"},
        {"label": "Coldest air temperature (1 m)", "value": round(min(lows) - 273.15, 1), "unit": "°C"},
        {"label": "Warmest air temperature (1 m)", "value": round(max(highs) - 273.15, 1), "unit": "°C"},
        {"label": "Typical day–night swing", "value": round(float(np.median(swings)), 1), "unit": "K"},
    ]

    # one row per sol for the sparkline: [sol, pressure Pa, min °C, max °C]
    series = [[d, round(sols[d]["pressure_mean"], 1) if sols[d]["pressure_mean"] is not None else None,
               round(sols[d]["air_min"] - 273.15, 1), round(sols[d]["air_max"] - 273.15, 1)] for d in days]

    output = {
        "metadata": {"status": "connected", "method": "Phoenix MET RMC tables: per-sol mean pressure and min/max air temperature at 1 m; -1 values dropped", "files": len(files), "sols": len(days)},
        "sites": {
            "phoenix": [{
                "agency": "CSA",
                "name": "Phoenix MET station, measured on Mars (2008)",
                "url": SOURCE_URL,
                "measurements": measurements,
                "series": series,
            }],
        },
    }

    with open(OUT_JSON, "w", encoding="utf-8") as outFile:
        json.dump(output, outFile, indent=1, ensure_ascii=False)

    print("done:", len(days), "sols from", len(files), "files")
    for m in measurements:
        print(" ", m["label"], ":", m["value"], m["unit"])

if __name__ == "__main__":
    main()
