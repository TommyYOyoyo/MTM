# RANK STABILITY: do the benchmarks stay in the top 5 when the weights change randomly?
# 1,000 random weightings (Dirichlet = random weights that always sum to 1). Prints numbers for the slide.
import json, sys
import numpy as np
import validate

SITES_JSON = "web/public/sites.json"
RUNS = 1000
TOP_K = 5
FACTORS = validate.NUMERIC + ["geology"] + validate.CATEGORY   # same 8 factors as the app


def similarities(marsSite, earthSite):
    out = []
    for f in validate.NUMERIC:
        out.append(validate.numericSimilarity(marsSite, earthSite, f))
    out.append(validate.geologySimilarity(marsSite, earthSite))
    for f in validate.CATEGORY:
        out.append(validate.categorySimilarity(marsSite, earthSite, f))
    return np.array([np.nan if s is None else s for s in out])


def weightedScore(sims, weights):
    usable = ~np.isnan(sims)
    if not usable.any():
        return None
    return 100 * np.sum(sims[usable] * weights[usable]) / np.sum(weights[usable])   # missing factor -> its weight is shared out


def main(sitesPath=SITES_JSON):
    sites = json.load(open(sitesPath, encoding="utf-8"))
    mars = {s["id"]: s for s in sites if s["planet"] == "mars"}
    earth = [s for s in sites if s["planet"] == "earth" and s.get("lat") is not None]
    benchmarks = [s for s in earth if s.get("benchmark") and s.get("twin") in mars]

    rng = np.random.default_rng(0)
    allWeights = rng.dirichlet(np.ones(len(FACTORS)), size=RUNS)
    simCache = {(b["twin"], e["id"]): similarities(mars[b["twin"]], e) for b in benchmarks for e in earth}

    hitsPerRun = np.zeros(RUNS)
    for b in benchmarks:
        inTop = 0
        for r, w in enumerate(allWeights):
            scores = [(weightedScore(simCache[(b["twin"], e["id"])], w), e["id"]) for e in earth]
            ranking = [eid for sc, eid in sorted(((sc, eid) for sc, eid in scores if sc is not None), reverse=True)]
            if b["id"] in ranking and ranking.index(b["id"]) < TOP_K:
                inTop += 1
                hitsPerRun[r] += 1
        print(f"{b['id']:>22} -> {b['twin']:<14} top-{TOP_K} in {inTop / RUNS:.0%} of weightings")

    print(f"median benchmarks in top-{TOP_K} per weighting: {np.median(hitsPerRun):.0f} / {len(benchmarks)}")
    print(f"weightings with at least half the benchmarks in top-{TOP_K}: {np.mean(hitsPerRun >= len(benchmarks) / 2):.0%}")


if __name__ == "__main__":
    main(*sys.argv[1:])