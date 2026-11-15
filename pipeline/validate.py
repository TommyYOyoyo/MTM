# CHECK IF OUR SCORING FINDS THE KNOWN ANALOGS (EQUAL WEIGHTS, NO TUNING)

from scipy.stats import binomtest, mannwhitneyu
import json

SITES_JSON = "web/public/sites.json"
NUMERIC = ["slope", "roughness", "thermal", "albedo", "sun"] # quantitative criteria
CATEGORY = ["ice", "subsurface"] # qualitative criteria
TOP_K = 5 # benchmark in top 5 --> hit

# numbers 0-1 --> 1 = same, 0 = opposite
def numericSimilarity(marsSite, earthSite, factor):
    marsValue = marsSite["n"].get(factor)
    earthValue = earthSite["n"].get(factor)
    
    if marsValue is None or earthValue is None:
        return None
    
    return 1 - abs(marsValue - earthValue)

# share of GEOLOGY tags in common
def geologySimilarity(marsSite, earthSite):
    marsTags = set(marsSite["tags"])
    earthTags = set(earthSite["tags"])

    if not marsTags or not earthTags:
        return None
    
    sharedTags = marsTags & earthTags # tags in both
    return len(sharedTags) / max(len(marsTags), len(earthTags))

# textual factors ONLY!! --> same = 1, diff = 0
def categorySimilarity(marsSite, earthSite, factor):
    marsValue = marsSite.get(factor)
    earthValue = earthSite.get(factor)
    
    if marsValue is None or earthValue is None:
        return None
    
    return 1.0 if marsValue == earthValue else 0.0

# avg of all usable factors (missing skipped) --> 0-100
def gowerScore(marsSite, earthSite):
    similarities = []
    
    for factor in NUMERIC:
        similarities.append(numericSimilarity(marsSite, earthSite, factor))
        
    similarities.append(geologySimilarity(marsSite, earthSite))
    
    for factor in CATEGORY:
        similarities.append(categorySimilarity(marsSite, earthSite, factor))
    
    usable = [similarity for similarity in similarities if similarity is not None]
    
    if not usable:
        return None
    
    return 100 * sum(usable) / len(usable)

# score every earth site for 1 mars site, best first
def rankEarthSites(marsSite, earthSites):
    scoredSites = []
    
    for earthSite in earthSites:
        score = gowerScore(marsSite, earthSite)
        
        if score is not None:
            scoredSites.append((score, earthSite["id"]))
    
    scoredSites.sort(reverse=True) # highest first
    return scoredSites

# is this earth site a known analog of this mars site
def isBenchmarkPair(marsSite, earthId, benchmarks):
    for benchmark in benchmarks:
        if benchmark["id"] == earthId and benchmark["twin"] == marsSite["id"]:
            return True
        
    return False

def main():
    with open(SITES_JSON, encoding="utf-8") as sitesFile:
        sites = json.load(sitesFile)
    
    marsSites = [site for site in sites if site["planet"] == "mars"]
    marsIds = [site["id"] for site in marsSites]
    earthSites = [site for site in sites if site["planet"] == "earth" and site.get("lat") is not None]
    
    # earth sites research marked as benchmark and marked as known analogs w/ a mars twin
    benchmarks = [site for site in earthSites if site.get("benchmark") and site.get("twin") in marsIds]
    
    if not benchmarks:
        print("no benchmarks yet, need earth rows with benchmark = yes and twin = mars id")
        return
    
    hits = 0
    benchmarkScores = [] # known pairs
    otherScores = [] # every other pair
    
    for marsSite in marsSites:
        scoredSites = rankEarthSites(marsSite, earthSites) # ranked sites
        ranking = [earthId for score, earthId in scoredSites] # ids only, best first
        
        # split scores into the 2 groups for mann-whitney
        for score, earthId in scoredSites:
            if isBenchmarkPair(marsSite, earthId, benchmarks):
                benchmarkScores.append(score)
            else:
                otherScores.append(score)
        
        # TEST 1: where did the known analog land
        for benchmark in benchmarks:
            if benchmark["twin"] != marsSite["id"] or benchmark["id"] not in ranking:
                continue # benchmark of another mars site
            
            rank = ranking.index(benchmark["id"]) + 1 # increase, index starts at 0
            
            if rank <= TOP_K:
                hits += 1
                
            print(benchmark["id"], "-->", marsSite["id"], "rank", rank, "/", len(ranking))
    
    # TEST 2: binomial --> could the hits be luck
    chance = min(1.0, TOP_K / len(earthSites)) # chance a random site is in top 5
    binomial = binomtest(hits, len(benchmarks), chance, alternative="greater")
    
    # TEST 3: mann-whitney --> do known pairs score higher than the rest
    mannWhitney = mannwhitneyu(benchmarkScores, otherScores, alternative="greater")
    
    benchmarkAvg = sum(benchmarkScores) / len(benchmarkScores)
    otherAvg = sum(otherScores) / len(otherScores)
    
    print("top", TOP_K, "hits:", hits, "/", len(benchmarks), "| chance per benchmark:", round(chance, 2))
    print("binomial p:", round(binomial.pvalue, 4))
    print("mann-whitney p:", round(mannWhitney.pvalue, 4), "| known pairs avg:", round(benchmarkAvg, 1), "vs others:", round(otherAvg, 1))
    
if __name__ == "__main__":
    main()