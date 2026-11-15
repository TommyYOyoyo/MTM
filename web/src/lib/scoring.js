const NUMERIC_FACTORS = ["slope", "albedo", "thermal inertia", "sun angle", "roughness", ];

const FACTORS = [
    ...NUMERIC_FACTORS,
    "ice",
    "geology",
    "subsurface"
];

function compareFactor(a, b, factor) {
    // Numerical factors scoring: between 0-1
    if (NUMERIC_FACTORS.includes(factor)) {
        const valueA = a.n?.[factor];
        const valueB = b.n?.[factor];

        if (valueA == null || valueB == null) {
            return null;
        }

        if (
            !Number.isFinite(valueA) ||
            !Number.isFinite(valueB) ||
            valueA < 0 || valueA > 1 ||
            valueB < 0 || valueB > 1
        ) {
            throw new Error(`Invalid normalized value for ${factor}`);
        }

        return 1 - Math.abs(valueA - valueB);
    }

    // Geology compares lists of tags.
    if (factor === "geology") {
        const tagsA = a.tags;
        const tagsB = b.tags;

        if (!tagsA?.length || !tagsB?.length) {
            return null;
    }

    const uniqueA = new Set(tagsA);
    const uniqueB = new Set(tagsB);

    const shared = [...uniqueA].filter(function (tag) {
        return uniqueB.has(tag);
        }
    );

    return shared.length / Math.max(uniqueA.size, uniqueB.size);
  }

  // Non-numerical factors scoring
  const valueA = a[factor];
  const valueB = b[factor];

  if (valueA == null || valueB == null) {
    return null;
  }

  return valueA === valueB ? 1 : 0;

}

const DEFAULT_WEIGHTS = {
  slope: 1,
  albedo: 1,
  thermal: 1,
  sun: 1,
  ice: 1,
  geology: 1,
  subsurface: 0,
};

export function overallScore(target, candidate, weights = DEFAULT_WEIGHTS) {
    let totalWeight = 0;
    let weightedTotal = 0;

    const parts = [];

    for (const factor of FACTORS) {
        const weight = weights[factor] ?? 0;

        if (!Number.isFinite(weight) || weight < 0) {
            throw new Error(`Invalid weight for ${factor}`);
        }

        if (weight === 0) continue;

        const sim = compareFactor(target, candidate, factor);
        parts.push({factor, weight, sim});

        if (sim === null) continue;
        
        weightedTotal += weight * sim;
        totalWeight += weight;

    }

    const score = totalWeight > 0 ? (weightedTotal / totalWeight) * 100 : null;

    return {score, parts};
}

export function rankSites(target, candidates, weights = DEFAULT_WEIGHTS) {
    return candidates.map(site => ({
        site, 
        ...overallScore(target, site, weights)
    }))
    .sort((a, b) => {
        const scoreA = a.score ?? -1;
        const scoreB = b.score ?? -1;

        return scoreB - scoreA || a.site.id.localeCompare(b.site.id)
    });
}

