/** Only coordinate-backed Earth or Mars locations can enter a dual view. */
export function validDualSites(sites = [], planet) {
  if (!['earth', 'mars'].includes(planet) || !Array.isArray(sites)) return []
  const seen = new Set()
  return sites.filter((site) => {
    if (site?.planet !== planet || typeof site.id !== 'string' || !site.id.trim()
      || !Number.isFinite(site.lat) || site.lat < -90 || site.lat > 90
      || !Number.isFinite(site.lon) || site.lon < -180 || site.lon > 180
      || seen.has(site.id)) return false
    seen.add(site.id)
    return true
  })
}

/** Prefer the current location and choose a different site for the other half. */
export function chooseDualPair(sites = [], planet, preferredId) {
  const available = validDualSites(sites, planet)
  const left = available.find((site) => site.id === preferredId) || available[0]
  const right = available.find((site) => site.id !== left?.id)
  return [left?.id || '', right?.id || '']
}
