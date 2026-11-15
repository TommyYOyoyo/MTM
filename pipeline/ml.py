# GROUP SITES INTO FAMILIES W/ ML (PCA + KMEANS) --> FAMILIES.JSON FOR THE CHECKS TAB

import json
import numpy as np
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score

SITES_JSON = "web/public/sites.json"
OUT_JSON = "web/public/families.json"
FACTORS = ["slope", "roughness", "thermal", "albedo", "sun"] # numeric 0-1 factors only

# table of sites x factors, missing value --> avg of that factor
def buildMatrix(sites):
    rows = []
    for site in sites:
        row = []
        for factor in FACTORS:
            value = site["n"].get(factor)
            row.append(np.nan if value is None else value)
        rows.append(row)

    matrix = np.array(rows, dtype=float)
    factorAvg = np.nanmean(matrix, axis=0)
    matrix = np.where(np.isnan(matrix), factorAvg, matrix) # fill holes

    return matrix

# try 2-5 families, keep the one that separates best
def bestFamilyCount(matrix):
    bestK = 2
    bestScore = -1

    for k in range(2, 6):
        labels = KMeans(k, n_init=10, random_state=0).fit_predict(matrix)
        score = silhouette_score(matrix, labels) # -1 bad --> 1 clear groups

        if score > bestScore:
            bestK = k
            bestScore = score

    return bestK

# name family after the factor that stands out the most
def familyName(matrix, labels, k):
    diff = matrix[labels == k].mean(axis=0) - matrix.mean(axis=0)
    top = int(np.argmax(np.abs(diff)))

    if diff[top] > 0:
        return "high " + FACTORS[top]

    return "low " + FACTORS[top]

def main():
    with open(SITES_JSON, encoding="utf-8") as sitesFile:
        sites = json.load(sitesFile)

    # need at least 4 of the 5 factors
    sites = [site for site in sites if site.get("n") and sum(site["n"].get(f) is None for f in FACTORS) <= 1]

    matrix = buildMatrix(sites)

    # 5 factors --> 2 axes (pc1, pc2) for the chart
    pca = PCA(n_components=2)
    coords = pca.fit_transform(matrix)

    k = bestFamilyCount(matrix)
    labels = KMeans(k, n_init=10, random_state=0).fit_predict(matrix)

    points = []
    for site, (pc1, pc2), label in zip(sites, coords, labels):
        label = int(label)
        points.append({
            "id": site["id"], "name": site["name"], "planet": site["planet"],
            "pc1": round(float(pc1), 4), "pc2": round(float(pc2), 4),
            "cluster": label,
            "family": "Family " + str(label + 1) + ": " + familyName(matrix, labels, label),
        })

    explained = [round(float(v), 3) for v in pca.explained_variance_ratio_]

    output = {
        "metadata": {"status": "connected", "method": "PCA (2 components) + k-means (k=" + str(k) + ", silhouette)", "explained_variance": explained},
        "points": points,
    }

    with open(OUT_JSON, "w", encoding="utf-8") as outFile:
        json.dump(output, outFile, indent=1, ensure_ascii=False)

    print(len(points), "sites |", k, "families | pca keeps", round(sum(explained) * 100), "% of the info")

    for label in range(k):
        members = [point["id"] for point in points if point["cluster"] == label]
        print("family", label + 1, "(" + familyName(matrix, labels, label) + "):", members)

if __name__ == "__main__":
    main()