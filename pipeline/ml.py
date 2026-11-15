# ANALOG FAMILIES: PCA (2D map of all sites) + k-means groups -> web/public/families.json
# Shown in the app's "Checks > Analog families" chart. Does NOT change any score.
import json, sys
import numpy as np
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score

SITES_JSON = "web/public/sites.json"
OUT_JSON = "web/public/families.json"
FACTORS = ["slope", "roughness", "thermal", "albedo", "sun"]   # the numeric 0-1 factors
MAX_MISSING = 1   # a site needs at least 4 of the 5 factors


def main(sitesPath=SITES_JSON, outPath=OUT_JSON):
    sites = json.load(open(sitesPath, encoding="utf-8"))
    sites = [s for s in sites if s.get("n") and sum(s["n"].get(f) is None for f in FACTORS) <= MAX_MISSING]

    matrix = np.array([[s["n"].get(f) if s["n"].get(f) is not None else np.nan for f in FACTORS] for s in sites], dtype=float)
    matrix = np.where(np.isnan(matrix), np.nanmean(matrix, axis=0), matrix)   # fill a missing factor with the average

    pca = PCA(n_components=2)
    coords = pca.fit_transform(matrix)   # each site becomes a point (pc1, pc2)

    # pick the number of families that separates the sites best (silhouette score)
    best = max(range(2, 6), key=lambda k: silhouette_score(matrix, KMeans(k, n_init=10, random_state=0).fit_predict(matrix)))
    labels = KMeans(best, n_init=10, random_state=0).fit_predict(matrix)

    # name each family after its most distinctive factor (highest or lowest vs the average)
    overall = matrix.mean(axis=0)
    names = {}
    for k in range(best):
        diff = matrix[labels == k].mean(axis=0) - overall
        top = int(np.argmax(np.abs(diff)))
        names[k] = f"{'high' if diff[top] > 0 else 'low'} {FACTORS[top]}"

    points = [{"id": s["id"], "name": s["name"], "planet": s["planet"],
               "pc1": round(float(x), 4), "pc2": round(float(y), 4),
               "cluster": int(c), "family": f"Family {int(c) + 1}: {names[int(c)]}"}
              for s, (x, y), c in zip(sites, coords, labels)]

    loadings = {f"pc{i + 1}": {f: round(float(w), 3) for f, w in zip(FACTORS, comp)} for i, comp in enumerate(pca.components_)}
    output = {"metadata": {"status": "connected", "method": f"PCA (2 components) + k-means (k={best}, chosen by silhouette) on normalized factors {FACTORS}",
                           "explained_variance": [round(float(v), 3) for v in pca.explained_variance_ratio_], "loadings": loadings},
              "points": points}
    json.dump(output, open(outPath, "w", encoding="utf-8"), indent=1, ensure_ascii=False)

    print(f"{len(points)} sites, k={best}, PCA explains {sum(pca.explained_variance_ratio_):.0%} of variance")
    for k in range(best):
        members = [p["id"] for p in points if p["cluster"] == k]
        print(f"  Family {k + 1} ({names[k]}): {len(members)} sites, e.g. {members[:5]}")


if __name__ == "__main__":
    main(*sys.argv[1:])