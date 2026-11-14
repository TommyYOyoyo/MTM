export const CHARACTERISTICS = [
  { key: 'slope', label: 'Slope', low: 'Flatter', high: 'Steeper', hint: 'Normalized slope, capped at 30°.' },
  { key: 'albedo', label: 'Albedo', low: 'Darker', high: 'Brighter', hint: 'Reflectivity on a 0–1 scale.' },
  { key: 'thermal', label: 'Thermal', low: 'Lower percentile', high: 'Higher percentile', hint: 'Relative within each planet, not a temperature.' },
  { key: 'sun', label: 'Sun exposure', low: 'Lower', high: 'Higher', hint: 'Latitude-based normalized sun proxy.' },
]

export const DEFAULT_CHARACTERISTICS = { slope: 0.2, albedo: 0.22, thermal: 0.55, sun: 1 }
const valid = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1

// Custom-target mode only; Coder A's site-to-site scoring module is untouched.
// Equal weights over available, requested factors (Gower numeric similarity).
export function matchCharacteristics(site, target) {
  const parts = CHARACTERISTICS.map(({ key }) => ({
    factor: key, weight: 1,
    sim: valid(site.n?.[key]) && valid(target.n?.[key]) ? 1 - Math.abs(site.n[key] - target.n[key]) : null,
  }))
  if (target.ice != null) parts.push({ factor: 'ice', weight: 1, sim: site.ice == null ? null : Number(site.ice === target.ice) })
  if (target.tags?.length) {
    const tags = [...new Set(site.tags ?? [])]
    const wanted = [...new Set(target.tags)]
    parts.push({ factor: 'geology', weight: 1, sim: tags.length ? wanted.filter(tag => tags.includes(tag)).length / Math.max(tags.length, wanted.length) : null })
  }
  const kept = parts.filter(part => part.sim !== null)
  return { site, parts, score: kept.length ? kept.reduce((sum, part) => sum + part.sim, 0) / kept.length * 100 : null, compared: kept.length, requested: parts.length }
}
