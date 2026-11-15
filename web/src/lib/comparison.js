import { DEFAULT_WEIGHTS, FACTORS, NUMERIC_FACTORS } from './constants.js'
import { PRESETS } from './presets.js'
import { overallScore, rankSites } from './scoring.js'

export const FACTOR_INFO = [
  { key: 'slope', label: 'Slope', kind: 'numeric', unit: '°', description: 'Normalized terrain slope. Compare measurements made at comparable ground scales.' },
  { key: 'albedo', label: 'Albedo', kind: 'numeric', unit: '', description: 'Surface reflectivity, normalized to 0–1.' },
  { key: 'thermal', label: 'Thermal', kind: 'numeric', unit: 'percentile', description: 'Relative rank within each planet: Mars TES thermal inertia versus Earth apparent thermal inertia, (1 − albedo) / day–night surface-temperature difference. These are different quantities; the score compares ranks, not physical equivalence.' },
  { key: 'sun', label: 'Sun', kind: 'numeric', unit: 'index', description: 'Latitude and axial-tilt proxy; not a measurement of local illumination or weather.' },
  { key: 'roughness', label: 'Roughness', kind: 'numeric', unit: 'index', description: 'Optional normalized terrain roughness. Its sampling scale must be documented.' },
  { key: 'ice', label: 'Ice', kind: 'category', unit: '', description: 'Agreement of the documented ice category. Permafrost and ground ice share the agreed scoring category; unverified ice remains missing.' },
  { key: 'geology', label: 'Geology', kind: 'tags', unit: '', description: 'Shared geology tags divided by the larger unique tag list.' },
  { key: 'subsurface', label: 'Subsurface', kind: 'category', unit: '', description: 'Optional exact agreement of documented cave or lava-tube tags.' },
]

const DATASET_SOURCES = {
  'NASA/NASADEM_HGT/001': { name: 'NASADEM HGT.001', agency: 'NASA', url: 'https://developers.google.com/earth-engine/datasets/catalog/NASA_NASADEM_HGT_001' },
  'MODIS/061/MCD43A3': { name: 'MODIS MCD43A3.061 shortwave albedo', agency: 'NASA', url: 'https://developers.google.com/earth-engine/datasets/catalog/MODIS_061_MCD43A3' },
  'MODIS/061/MOD11A2': { name: 'MODIS MOD11A2.061 land surface temperature', agency: 'NASA', url: 'https://developers.google.com/earth-engine/datasets/catalog/MODIS_061_MOD11A2' },
  'MODIS/061/MOD13A2': { name: 'MODIS MOD13A2.061 vegetation indices', agency: 'NASA', url: 'https://developers.google.com/earth-engine/datasets/catalog/MODIS_061_MOD13A2' },
  'JRC/GSW1_4/GlobalSurfaceWater': { name: 'JRC Global Surface Water v1.4', agency: 'European Commission JRC / Google', url: 'https://developers.google.com/earth-engine/datasets/catalog/JRC_GSW1_4_GlobalSurfaceWater' },
}

const nonnegative = (value) => Number.isFinite(value) && value > 0 ? value : 0
const CORE_WEIGHTS = Object.fromEntries(FACTORS.map((key) => [key, nonnegative(DEFAULT_WEIGHTS[key])]))
const numberOrNull = (value) => ['number', 'string'].includes(typeof value) && !(typeof value === 'string' && !value.trim()) && Number.isFinite(Number(value)) ? Number(value) : null
const list = (value) => Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[;\n]/) : []
const textList = (value) => list(value).filter((entry) => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean)
const words = (value) => [...new Set((Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,;\n]/) : []).filter((entry) => typeof entry === 'string').map((entry) => entry.trim().toLowerCase()).filter(Boolean))]
const category = (value) => typeof value === 'string' && value.trim() && !/^(unknown|missing|n\/a|null|undefined|nan)$/i.test(value.trim()) ? value.trim().toLowerCase() : null
const isTrue = (value) => value === true || value === 1 || typeof value === 'string' && /^(true|yes|1)$/i.test(value.trim())
const placeholderSite = (site) => isTrue(site?.placeholder) || /\b(fake|sample|example|placeholder)\b/i.test([site?.name, site?.notes, site?.data_status, site?.status].filter(Boolean).join(' '))
const benchmarkTargetsFor = (site) => words([...words(site.expectedMarsIds), ...words(site.benchmarkTargets), ...words(site.twin)])

/** Largest-remainder allocation keeps sliders at exactly 100 integer percent. */
function allocate(values, total, keys = FACTORS) {
  const denominator = keys.reduce((sum, key) => sum + nonnegative(values[key]), 0)
  const raw = keys.map((key) => ({ key, value: denominator ? nonnegative(values[key]) / denominator * total : total / keys.length }))
  const result = Object.fromEntries(raw.map(({ key, value }) => [key, Math.floor(value)]))
  const remainder = total - Object.values(result).reduce((sum, value) => sum + value, 0)
  raw.sort((a, b) => (b.value % 1) - (a.value % 1) || keys.indexOf(a.key) - keys.indexOf(b.key))
  for (let index = 0; index < remainder; index += 1) result[raw[index % raw.length].key] += 1
  return result
}

export function normalizeWeights(weights = CORE_WEIGHTS) {
  const values = Object.fromEntries(FACTORS.map((key) => [key, nonnegative(weights?.[key])]))
  const shares = Object.values(values).some(Boolean) ? values : CORE_WEIGHTS
  const active = FACTORS.filter((key) => shares[key] > 0)
  // Equal weighting must be mathematically equal in the score. Integer rounding
  // would otherwise favor the first four of six factors by a percentage point.
  if (active.every((key) => Math.abs(shares[key] - shares[active[0]]) < 1e-9)) {
    return Object.fromEntries(FACTORS.map((key) => [key, active.includes(key) ? 100 / active.length : 0]))
  }
  return allocate(shares, 100)
}

export function setFactorWeight(weights, factor, value) {
  if (!FACTORS.includes(factor)) return normalizeWeights(weights)
  const current = normalizeWeights(weights)
  const amount = Math.max(0, Math.min(100, Math.round(numberOrNull(value) ?? 0)))
  const others = FACTORS.filter((key) => key !== factor)
  let shares = current
  if (!others.some((key) => current[key] > 0)) {
    // Redistribute to the core factors first, without silently enabling optional ones.
    shares = Object.fromEntries(others.map((key) => [key, CORE_WEIGHTS[key] || 0]))
  }
  return { ...allocate(shares, 100 - amount, others), [factor]: amount }
}

export const WEIGHT_PRESETS = [
  { id: 'equal', label: 'Equal', weights: normalizeWeights(CORE_WEIGHTS) },
  ...PRESETS.map((preset) => ({ ...preset, weights: normalizeWeights(preset.weights) })),
]

export function safeExternalUrl(value) {
  try {
    if (typeof value !== 'string' || /[|\r\n]/.test(value)) return null
    const parsed = new URL(value.trim())
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null
  } catch { return null }
}

export function safeImageUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const external = safeExternalUrl(value)
  if (external) return external
  return /^(?:\.?\/)?[\w/-]+\.(?:png|jpe?g|webp|avif|svg)(?:\?[^#]*)?$/i.test(value) && !value.includes('..') ? value : null
}

function doiValue(value) {
  const doi = typeof value === 'string' ? value.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '') : ''
  return /^10\.\d{4,9}\/\S+$/i.test(doi) ? doi : null
}

function paperEntry(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const entry = { ...value }
    const url = safeExternalUrl(entry.url || entry.href)
    const doi = doiValue(entry.doi)
    return { ...entry, ...(url ? { url } : {}), ...(doi ? { doi } : {}) }
  }
  if (typeof value !== 'string' || !value.trim()) return null
  const parts = value.split('|').map((part) => part.trim()).filter(Boolean)
  if (!parts.length) return null
  const identifiers = parts.length > 1 ? parts.slice(1) : parts
  const url = identifiers.map(safeExternalUrl).find(Boolean)
  const doi = identifiers.map(doiValue).find(Boolean)
  return {
    title: parts[0],
    ...(url ? { url } : {}),
    ...(doi ? { doi } : {}),
    ...(!url && !doi && parts.length > 1 ? { identifier: parts.slice(1).join(' | ') } : {}),
  }
}

export function paperUrl(value) {
  const paper = paperEntry(value)
  const direct = safeExternalUrl(paper?.url || paper?.href)
  if (direct) return direct
  const doi = doiValue(paper?.doi)
  return doi ? `https://doi.org/${encodeURI(doi).replace(/[?#]/g, (character) => encodeURIComponent(character))}` : null
}

function linkEntries(value, defaultLabel) {
  return list(value).flatMap((entry) => {
    if (typeof entry === 'string') {
      const dataset = DATASET_SOURCES[entry.trim()]
      if (dataset) return [{ ...dataset, href: dataset.url }]
      const parts = entry.split('|').map((part) => part.trim()).filter(Boolean)
      const href = parts.map(safeExternalUrl).find(Boolean)
      return href ? [{ name: parts.find((part) => !safeExternalUrl(part)) || defaultLabel, label: parts.find((part) => !safeExternalUrl(part)) || defaultLabel, url: href, href }] : []
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
    const href = safeExternalUrl(entry.url || entry.href)
    return href ? [{ ...entry, name: entry.name || entry.label || defaultLabel, url: href, href }] : []
  })
}

function sanitizeScoringSite(site = {}) {
  if (!site || typeof site !== 'object') site = {}
  const discovery = isTrue(site.discovery)
  const researchIce = category(site.research_ice) || category(site.ice)
  const n = Object.fromEntries(NUMERIC_FACTORS.map((factor) => {
    const value = numberOrNull(site.n?.[factor])
    return [factor, value !== null && value >= 0 && value <= 1 ? value : null]
  }))
  return { ...site, n, discovery, tags: discovery ? [] : words(site.tags), research_ice: researchIce, ice: discovery ? null : researchIce === 'permafrost' ? 'ground_ice' : researchIce, subsurface: discovery ? null : category(site.subsurface), placeholder: placeholderSite(site) }
}

/** Accept the handoff JSON contract plus harmless CSV-export aliases. Never invent n values. */
export function adaptSites(data, { discovery = false } = {}) {
  const rows = Array.isArray(data) ? data : Array.isArray(data?.sites) ? data.sites : []
  const placeholderDataset = !Array.isArray(data) && /\b(fake|sample|example|placeholder)\b/i.test([data?.metadata?.status, data?.metadata?.data_status].filter(Boolean).join(' '))
  const seen = new Set()
  const datasetSources = linkEntries(data?.metadata?.sources, 'Dataset')
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return []
    const id = typeof row.id === 'string' ? row.id.trim() : ''
    const planet = category(row.planet)
    const lat = numberOrNull(row.lat)
    const lon = numberOrNull(row.lon)
    if (!id || seen.has(id) || !['earth', 'mars'].includes(planet) || lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return []
    seen.add(id)
    const site = sanitizeScoringSite({ ...row, discovery: discovery || isTrue(row.discovery) })
    const dataIssues = NUMERIC_FACTORS.filter((key) => row.n?.[key] !== null && row.n?.[key] !== undefined && row.n?.[key] !== '' && site.n[key] === null).map((key) => `Invalid normalized ${key}`)
    const paperEntries = list(row.papers).map(paperEntry).filter(Boolean)
    const placeholder = placeholderDataset || isTrue(row.placeholder) || /\b(fake|sample|example|placeholder)\b/i.test([row.name, row.notes, row.data_status, row.status, ...paperEntries.map((entry) => entry.title)].filter(Boolean).join(' '))
    const benchmarkTargets = benchmarkTargetsFor(row)
    const coordSources = [...new Set([...list(row.coord_sources), ...list(row.coord_source)].flatMap((entry) => typeof entry === 'string' ? entry.split('|') : []).map(safeExternalUrl).filter(Boolean))]
    const links = linkEntries(row.links, 'Related link')
    const linkUrls = new Set(links.map((entry) => entry.href))
    coordSources.slice(1).forEach((href, index) => {
      if (!linkUrls.has(href)) links.push({ label: `Coordinate source ${index + 2}`, url: href, href })
    })
    return [{
      ...site, id, planet, lat, lon,
      name: typeof row.name === 'string' && row.name.trim() ? row.name.trim() : id,
      elevation_m: numberOrNull(row.elevation_m) ?? numberOrNull(row.raw?.elevation_m) ?? numberOrNull(row.measurements?.elevation_m),
      radius_km: numberOrNull(row.radius_km),
      benchmark: isTrue(row.benchmark), benchmarkTargets, expectedMarsIds: benchmarkTargets,
      placeholder, discovery: discovery || isTrue(row.discovery),
      dataStatus: placeholder ? 'placeholder' : discovery || isTrue(row.discovery) ? 'partial' : 'provided',
      dataIssues,
      raw: row.raw && typeof row.raw === 'object' && !Array.isArray(row.raw) ? row.raw : row.measurements && typeof row.measurements === 'object' && !Array.isArray(row.measurements) ? row.measurements : {},
      pros: textList(row.pros),
      cons: textList(row.cons),
      limits: textList(row.limits),
      limitations: textList(row.limitations),
      papers: paperEntries.map((entry) => ({ ...entry, href: paperUrl(entry) })),
      sources: linkEntries(row.sources, 'Dataset').length ? linkEntries(row.sources, 'Dataset') : datasetSources,
      links,
      img: safeImageUrl(row.img), satellite_img: safeImageUrl(row.satellite_img),
      coord_source: coordSources[0] || null, coord_sources: coordSources,
    }]
  })
}

function decorateComparison(target, candidate, result, weights) {
  const activeWeight = FACTORS.reduce((sum, key) => sum + nonnegative(weights[key]), 0)
  const keptWeight = result.parts.reduce((sum, part) => sum + (part.sim === null ? 0 : part.weight), 0)
  const parts = result.parts.map((part) => ({
    ...part,
    label: FACTOR_INFO.find((factor) => factor.key === part.factor)?.label || part.factor,
    targetValue: NUMERIC_FACTORS.includes(part.factor) ? target.n?.[part.factor] ?? null : part.factor === 'geology' ? target.tags : target[part.factor] ?? null,
    candidateValue: NUMERIC_FACTORS.includes(part.factor) ? candidate.n?.[part.factor] ?? null : part.factor === 'geology' ? candidate.tags : candidate[part.factor] ?? null,
    effectiveWeight: part.sim !== null && keptWeight ? part.weight / keptWeight * 100 : 0,
    contribution: part.sim !== null && keptWeight ? part.weight * part.sim / keptWeight * 100 : null,
  }))
  const missingFactors = parts.filter((part) => part.sim === null).map((part) => part.factor)
  return {
    site: candidate, score: result.score, parts,
    coverage: activeWeight ? keptWeight / activeWeight * 100 : 0,
    missingFactors,
    matches: parts.filter((part) => part.sim === 1),
    breaks: parts.filter((part) => part.sim !== null && part.sim < 1),
    partial: missingFactors.length > 0 || !!candidate.discovery,
    placeholder: !!target.placeholder || !!candidate.placeholder,
  }
}

export function compareSites(target, candidate, weights = WEIGHT_PRESETS[0].weights) {
  const cleanTarget = sanitizeScoringSite(target)
  const cleanCandidate = sanitizeScoringSite(candidate)
  return decorateComparison(cleanTarget, cleanCandidate, overallScore(cleanTarget, cleanCandidate, weights), weights)
}

/** Elevation filters only Mars sites; it never contributes to the resemblance score. */
export function rankComparisons(target, candidates = [], weights = WEIGHT_PRESETS[0].weights, options = {}) {
  if (!target || !['earth', 'mars'].includes(target.planet)) return []
  const query = String(options.query || '').trim().toLowerCase()
  const selectedTags = words(options.tags)
  const maxElevation = numberOrNull(options.maxElevation)
  const minCoverage = Math.max(0, Math.min(100, numberOrNull(options.minCoverage) ?? 0))
  const available = candidates.filter((site) => site && site.id !== target.id && site.planet !== target.planet && ['earth', 'mars'].includes(site.planet))
    .filter((site) => !query || `${site.name || ''} ${site.id} ${(site.tags || []).join(' ')}`.toLowerCase().includes(query))
    .filter((site) => !options.benchmarkOnly || site.benchmark)
    .filter((site) => !selectedTags.length || selectedTags.every((tag) => (site.tags || []).includes(tag)))
    .filter((site) => maxElevation === null || site.planet !== 'mars' || (Number.isFinite(site.elevation_m) ? site.elevation_m <= maxElevation : options.includeMissingElevation === true))
    .map(sanitizeScoringSite)
  const cleanTarget = sanitizeScoringSite(target)
  return rankSites(cleanTarget, available, weights).map((result) => decorateComparison(cleanTarget, result.site, result, weights)).filter((result) => result.coverage >= minCoverage)
}

/** A benchmark needs a researcher-supplied Earth-to-Mars pairing, never an inferred one. */
export function validateBenchmarks(sites = [], weights = WEIGHT_PRESETS[0].weights) {
  const earthSites = sites.filter((site) => site.planet === 'earth' && !site.discovery)
  const marsSites = sites.filter((site) => site.planet === 'mars')
  const rows = earthSites.filter((site) => isTrue(site.benchmark)).flatMap((site) => {
    const targets = benchmarkTargetsFor(site)
    if (!targets.length) return [{ site, target: null, rank: null, score: null, status: 'unconfigured', reason: 'Researcher pairing needed', wouldPass: null }]
    return targets.map((targetId) => {
      const target = marsSites.find((entry) => entry.id === targetId)
      if (!target) return { site, target: null, targetId, rank: null, score: null, status: 'unconfigured', reason: 'Paired Mars target is unavailable', wouldPass: null }
      const ranking = rankComparisons(target, earthSites, weights)
      const index = ranking.findIndex((entry) => entry.site.id === site.id)
      const result = ranking[index]
      const rank = index < 0 || result?.score === null ? null : index + 1
      if (placeholderSite(site) || placeholderSite(target)) return { site, target, rank, score: result?.score ?? null, status: 'placeholder', reason: 'Placeholder data; not scientific validation', wouldPass: rank !== null ? rank <= 5 : null }
      return { site, target, rank, score: result?.score ?? null, status: rank === null ? 'missing' : rank <= 5 ? 'pass' : 'fail', reason: rank === null ? 'No usable comparison data' : null, wouldPass: rank !== null ? rank <= 5 : null }
    })
  })
  return {
    rows, total: rows.length,
    configured: rows.filter((row) => row.target).length,
    passed: rows.filter((row) => row.status === 'pass').length,
    pending: rows.filter((row) => ['unconfigured', 'placeholder', 'missing'].includes(row.status)).length,
  }
}

function csvValue(value) {
  const text = value === null || value === undefined ? '' : Array.isArray(value) ? value.join('; ') : String(value)
  // Avoid spreadsheet formulas when user-supplied names are opened as CSV.
  const safe = /^[=+@-]/.test(text) && typeof value !== 'number' ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}

export function resultsToCsv(results, target, weights = WEIGHT_PRESETS[0].weights) {
  const headers = ['rank', 'target_id', 'candidate_id', 'name', 'planet', 'latitude', 'longitude', 'resemblance_percent', 'coverage_percent', 'status', 'missing_factors', 'sources', 'papers', ...FACTORS.map((key) => `weight_${key}`)]
  const rows = results.map((result, index) => [
    index + 1, target?.id, result.site.id, result.site.name, result.site.planet, result.site.lat, result.site.lon,
    result.score === null ? null : Number(result.score.toFixed(2)), Number(result.coverage.toFixed(2)),
    result.placeholder ? 'placeholder' : result.site.discovery ? 'partial; not yet studied' : result.partial ? 'partial' : 'provided data',
    result.missingFactors,
    (result.site.sources || []).map((source) => source.href || source.url).filter(Boolean),
    (result.site.papers || []).map((paper) => paper.href || paperUrl(paper)).filter(Boolean),
    ...FACTORS.map((key) => weights[key] || 0),
  ])
  return [headers, ...rows].map((row) => row.map(csvValue).join(',')).join('\r\n')
}
