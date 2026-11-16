import { DEFAULT_WEIGHTS } from './constants.js'

const WEIGHT_KEYS = Object.keys(DEFAULT_WEIGHTS)
const VIEWS = ['matches', 'discovery', 'checks']

// ?target=meridiani&preset=equal&site=rio_tinto_bm --> same ranking for whoever opens it
export function shareUrl({ targetId, presetId, weights, selectedId, view }, base = window.location) {
  const params = new URLSearchParams()
  if (targetId) params.set('target', targetId)
  if (presetId && presetId !== 'custom') params.set('preset', presetId)
  else if (weights) params.set('w', WEIGHT_KEYS.map((key) => Math.round((weights[key] || 0) * 1000) / 1000).join(','))
  if (selectedId) params.set('site', selectedId)
  if (VIEWS.includes(view) && view !== 'matches') params.set('view', view)
  return `${base.origin}${base.pathname}?${params}`
}

// read it back, ids are checked against the loaded sites by the caller
export function readShared(search = window.location.search) {
  const params = new URLSearchParams(search)
  const w = params.get('w')?.split(',').map(Number)
  return {
    targetId: params.get('target'),
    presetId: params.get('preset'),
    weights: w?.length === WEIGHT_KEYS.length && w.every((value) => Number.isFinite(value) && value >= 0) ? Object.fromEntries(WEIGHT_KEYS.map((key, i) => [key, w[i]])) : null,
    selectedId: params.get('site'),
    view: VIEWS.includes(params.get('view')) ? params.get('view') : 'matches',
  }
}

const xml = (value) => String(value ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c])
const round = (value, digits = 1) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null

// geojson of the target's matches, opens in QGIS / geojson.io / ArcGIS
// note: mars matches use mars lat/lon, geojson assumes earth so the planet is in the properties
export function matchesGeoJson(target, results) {
  return JSON.stringify({
    type: 'FeatureCollection',
    name: `Space Out matches for ${target.name}`,
    target: { id: target.id, name: target.name, planet: target.planet, lat: target.lat, lon: target.lon },
    features: results.map((result, i) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [result.site.lon, result.site.lat] },
      properties: { rank: i + 1, id: result.site.id, name: result.site.name, planet: result.site.planet, score: round(result.score), coverage: round(result.coverage), benchmark: Boolean(result.site.benchmark), radius_km: result.site.radius_km ?? null },
    })),
  }, null, 2)
}

// kml for google earth. mars matches --> hint="target=mars" so google earth pro opens them on mars
export function matchesKml(target, results) {
  const planet = results[0]?.site.planet || 'earth'
  const marks = results.map((result, i) => `  <Placemark>
    <name>${i + 1}. ${xml(result.site.name)}</name>
    <description>${xml(`Resemblance to ${target.name}: ${round(result.score) ?? '-'}% · ${Math.round(result.coverage)}% data coverage${result.site.benchmark ? ' · published analog' : ''}`)}</description>
    <Point><coordinates>${result.site.lon},${result.site.lat},0</coordinates></Point>
  </Placemark>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"${planet === 'mars' ? ' hint="target=mars"' : ''}>
<Document>
  <name>${xml(`Space Out · analogs of ${target.name}`)}</name>
${marks}
</Document>
</kml>
`
}
