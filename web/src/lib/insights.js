import { NUMERIC_FACTORS } from './constants.js'
import { compareSites } from './comparison.js'

const EARTH_RADIUS_KM = 6371
const NEW_GROUND_KM = 500 // further than this from every known analog --> "new ground"

// great circle distance in km
export function distanceKm(a, b) {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

// known analogs = earth sites from the literature (benchmarks)
export function knownAnalogs(sites = []) {
  return sites.filter((site) => site.planet === 'earth' && !site.discovery && (site.benchmark === true || /_bm$/.test(site.id)))
}

// how far is this earth site from the closest famous analog --> discovery tag
export function nearestKnown(site, known = []) {
  if (!site || site.planet !== 'earth') return null
  if (known.some((entry) => entry.id === site.id)) return { tag: 'known', label: 'Known analog', km: 0, near: site }
  let best = null
  for (const entry of known) {
    const km = distanceKm(site, entry)
    if (!best || km < best.km) best = { km, near: entry }
  }
  if (!best) return null
  return best.km > NEW_GROUND_KM
    ? { tag: 'new', label: 'New ground', km: best.km, near: best.near }
    : { tag: 'near', label: `Near ${best.near.name.split(/[,(]/)[0].trim()}`, km: best.km, near: best.near }
}

// terrain + surface only (discovery points have no ice / geology so this keeps it fair)
const terrainWeights = (weights) => Object.fromEntries(Object.entries(weights).map(([key, value]) => [key, NUMERIC_FACTORS.includes(key) ? value : 0]))

// null baseline: score the target against 340 random dry land places once (terrain + surface factors)
export function nullBaseline(target, randomSites = [], weights = {}) {
  if (!target || target.planet !== 'mars' || !randomSites.length) return null
  const w = terrainWeights(weights)
  if (!Object.values(w).some((value) => value > 0)) return null
  const scores = randomSites.map((entry) => compareSites(target, entry, w).score).filter((value) => value !== null).sort((a, b) => a - b)
  return scores.length ? { weights: w, scores, count: scores.length } : null
}

// where does this match land vs the random places --> "beats 95% of 340"
export function beatsBaseline(baseline, target, site) {
  if (!baseline || !site || site.planet !== 'earth') return null
  const score = compareSites(target, site, baseline.weights).score
  if (score === null) return null
  let beaten = 0
  while (beaten < baseline.scores.length && baseline.scores[beaten] < score) beaten += 1
  return { score, share: beaten / baseline.count, count: baseline.count }
}

// bins for the little histogram (5 point steps, from `low` up to 100)
export function histogram(values, step = 5, low = 0) {
  const bins = Array.from({ length: Math.ceil((100 - low) / step) }, (_, i) => ({ from: low + i * step, count: 0 }))
  for (const value of values) bins[Math.max(0, Math.min(bins.length - 1, Math.floor((value - low) / step)))].count += 1
  return bins
}
