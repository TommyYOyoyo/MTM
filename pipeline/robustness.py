# DO BENCHMARKS STAY IN TOP 5 WHEN THE WEIGHTS CHANGE RANDOMLY? (1000 RANDOM WEIGHTINGS)

import json
import numpy as np
import validate

SITES_JSON = "web/public/sites.json" # run from the repo root
RUNS = 1000
TOP_K = 5

# similarity of 1 mars site vs 1 earth site for 7 factors, missing --> nan
# subsurface left out: no verified data yet, same as the app
def factorSimilarities(marsSite, earthSite):
    similarities = []

    for factor in validate.NUMERIC:
        similarities.append(validate.numericSimilarity(marsSite, earthSite, factor))

    similarities.append(validate.geologySimilarity(marsSite, earthSite))

    for factor in validate.CATEGORY:
        if factor == "subsurface":
            continue
        similarities.append(validate.categorySimilarity(marsSite, earthSite, factor))

    return np.array([np.nan if s is None else s for s in similarities])

# weighted avg, missing factor --> its weight is shared by the others
def weightedScore(similarities, weights):
    usable = ~np.isnan(similarities)

    if not usable.any():
        return None

    return 100 * np.sum(similarities[usable] * weights[usable]) / np.sum(weights[usable])

def main():
    with open(SITES_JSON, encoding="utf-8") as sitesFile:
        sites = json.load(sitesFile)

    marsById = {site["id"]: site for site in sites if site["planet"] == "mars"}
    earthSites = [site for site in sites if site["planet"] == "earth" and site.get("lat") is not None]
    benchmarks = [site for site in earthSites if site.get("benchmark") and site.get("twin") in marsById]

    # random weights that always add up to 1 (dirichlet)
    rng = np.random.default_rng(0)
    allWeights = rng.dirichlet(np.ones(7), size=RUNS)

    hitsPerRun = np.zeros(RUNS)

    for benchmark in benchmarks:
        marsSite = marsById[benchmark["twin"]]

        # compute similarities once, only the weights change
        simsByEarth = {earth["id"]: factorSimilarities(marsSite, earth) for earth in earthSites}

        timesInTop = 0
        for run, weights in enumerate(allWeights):
            scored = []
            for earthId, sims in simsByEarth.items():
                score = weightedScore(sims, weights)
                if score is not None:
                    scored.append((score, earthId))

            scored.sort(reverse=True) # best first
            ranking = [earthId for score, earthId in scored]

            if benchmark["id"] in ranking and ranking.index(benchmark["id"]) < TOP_K:
                timesInTop += 1
                hitsPerRun[run] += 1

        print(benchmark["id"], "-->", marsSite["id"], "| top", TOP_K, "in", round(timesInTop / RUNS * 100), "% of weightings")

    print("median benchmarks in top", TOP_K, ":", int(np.median(hitsPerRun)), "/", len(benchmarks))
    print("weightings w/ at least half in top", TOP_K, ":", round(np.mean(hitsPerRun >= len(benchmarks) / 2) * 100), "%")

if __name__ == "__main__":
    main()