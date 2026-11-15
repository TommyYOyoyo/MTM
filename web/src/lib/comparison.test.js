import test from 'node:test'
import assert from 'node:assert/strict'
import { adaptSites, normalizeWeights, setFactorWeight, WEIGHT_PRESETS, compareSites, rankComparisons, validateBenchmarks, resultsToCsv, safeExternalUrl, paperUrl } from './comparison.js'
import { PRESETS } from './presets.js'
import { DEFAULT_WEIGHTS } from './constants.js'

const site = (id, planet, extra = {}) => ({ id, name: id, planet, lat: 10, lon: 20, n: { slope: 0.2, albedo: 0.3, thermal: 0.4, sun: 0.7 }, ice: 'none', tags: ['basaltic'], ...extra })

test('equal weights are exact peers, then sliders keep 100 integer percent and optional factors stay off', () => {
  let weights = normalizeWeights()
  assert.equal(weights.slope, weights.geology)
  assert.equal(weights.ice, weights.albedo)
  assert.ok(Math.abs(Object.values(weights).reduce((sum, weight) => sum + weight, 0) - 100) < 1e-10)
  for (const value of [99, 100, 0, 33, 67]) {
    weights = setFactorWeight(weights, 'slope', value)
    assert.equal(weights.slope, value)
    assert.equal(Object.values(weights).reduce((sum, weight) => sum + weight, 0), 100)
    assert.ok(Object.values(weights).every(Number.isInteger))
    assert.equal(weights.roughness, 0)
    assert.equal(weights.subsurface, 0)
  }
  weights = setFactorWeight(weights, 'subsurface', 25)
  assert.equal(weights.subsurface, 25)
  assert.equal(Object.values(weights).reduce((sum, weight) => sum + weight, 0), 100)
  for (const preset of WEIGHT_PRESETS) assert.ok(Math.abs(Object.values(preset.weights).reduce((sum, weight) => sum + weight, 0) - 100) < 1e-10)
  assert.deepEqual(WEIGHT_PRESETS[0].weights, normalizeWeights(DEFAULT_WEIGHTS))
  for (const preset of PRESETS) assert.deepEqual(WEIGHT_PRESETS.find((entry) => entry.id === preset.id).weights, normalizeWeights(preset.weights))
})

test('input adaptation preserves missing values, sanitizes bad values and skips duplicate or invalid coordinates', () => {
  const data = adaptSites([
    site('mars', 'MARS', { n: { slope: '0.2', albedo: '', thermal: 4, sun: ' ' }, tags: 'Basaltic, basaltic, volcanic', benchmark: 'yes', twin: 'gale', papers: 'Study | 10.1234/example', raw: { slope_deg: 6 }, sources: [{ name: 'unsafe', url: 'javascript:alert(1)' }] }),
    site('mars', 'mars'),
    site('no-coordinate', 'earth', { lat: '' }),
    site('boolean-coordinate', 'earth', { lat: true }),
    site('bad-longitude', 'earth', { lon: 181 }),
  ])
  assert.equal(data.length, 1)
  assert.equal(data[0].n.slope, 0.2)
  assert.equal(data[0].n.albedo, null)
  assert.equal(data[0].n.thermal, null)
  assert.equal(data[0].n.sun, null)
  assert.deepEqual(data[0].tags, ['basaltic', 'volcanic'])
  assert.equal(data[0].benchmark, true)
  assert.deepEqual(data[0].benchmarkTargets, ['gale'])
  assert.equal(data[0].sources.length, 0)
  assert.equal(data[0].papers[0].href, 'https://doi.org/10.1234/example')
  assert.equal(data[0].raw.slope_deg, 6)
  assert.deepEqual(data[0].dataIssues, ['Invalid normalized thermal', 'Invalid normalized sun'])
  const booleans = adaptSites([site('bad-measurements', 'earth', { n: { slope: true, albedo: false, sun: [] } })])[0]
  assert.equal(booleans.n.slope, null)
  assert.equal(booleans.n.albedo, null)
  assert.equal(booleans.n.sun, null)
})

test('dataset and row placeholders stay explicit without changing scientific values', () => {
  const fake = adaptSites([site('fake', 'earth', { name: 'FAKE Earth A', n: { slope: null } })])[0]
  assert.equal(fake.placeholder, true)
  assert.equal(fake.n.slope, null)
  const wrapped = adaptSites({ metadata: { status: 'placeholder' }, sites: [site('one', 'mars')] })[0]
  assert.equal(wrapped.placeholder, true)
})

test('comparison renormalizes missing data and reports coverage instead of implying a complete match', () => {
  const target = site('gale', 'mars')
  const candidate = site('partial', 'earth', { n: { slope: 0.2, albedo: null } })
  const result = compareSites(target, candidate, { slope: 20, albedo: 80 })
  assert.equal(result.score, 100)
  assert.equal(result.coverage, 20)
  assert.deepEqual(result.missingFactors, ['albedo'])
  assert.equal(result.partial, true)
  assert.equal(result.parts[0].effectiveWeight, 100)
  assert.equal(result.parts[0].contribution, 100)
  assert.equal(result.parts[1].effectiveWeight, 0)
  const differences = compareSites(target, site('different', 'earth', { n: { slope: 0.25, albedo: 0.3 } }), { slope: 50, albedo: 50 })
  assert.deepEqual(differences.matches.map((part) => part.factor), ['albedo'])
  assert.deepEqual(differences.breaks.map((part) => part.factor), ['slope'])
})

test('ranking uses opposite planet, missing-score order, search, coverage and non-scoring elevation filter', () => {
  const target = site('earth', 'earth')
  const candidates = [site('high', 'mars', { elevation_m: 100 }), site('low', 'mars', { elevation_m: -3000 }), site('unknown', 'mars'), site('earth-two', 'earth')]
  const all = rankComparisons(target, candidates, { slope: 100 })
  assert.equal(all.length, 3)
  assert.equal(all[0].score, all[1].score)
  const filtered = rankComparisons(target, candidates, { slope: 100 }, { maxElevation: -1000 })
  assert.deepEqual(filtered.map((entry) => entry.site.id), ['low'])
  const withMissing = rankComparisons(target, candidates, { slope: 100 }, { maxElevation: -1000, includeMissingElevation: true })
  assert.deepEqual(withMissing.map((entry) => entry.site.id), ['low', 'unknown'])
  const partial = site('partial', 'mars', { n: { slope: null } })
  assert.equal(rankComparisons(target, [partial], { slope: 100 }, { minCoverage: 1 }).length, 0)
  assert.deepEqual(rankComparisons(target, candidates, { slope: 100 }, { query: 'low' }).map((entry) => entry.site.id), ['low'])
})

test('discovery results remain partial and not yet studied even with complete numeric values', () => {
  const discovered = adaptSites([site('cell', 'earth')], { discovery: true })[0]
  const result = compareSites(site('gale', 'mars'), discovered, { slope: 100 })
  assert.equal(result.site.discovery, true)
  assert.equal(result.partial, true)
  assert.equal(result.coverage, 100)
  const mixed = compareSites(site('gale', 'mars'), discovered, { slope: 50, ice: 25, geology: 25 })
  assert.equal(mixed.score, 100)
  assert.equal(mixed.coverage, 50)
  assert.deepEqual(mixed.missingFactors, ['ice', 'geology'])
  assert.equal(discovered.ice, null)
  assert.deepEqual(discovered.tags, [])
})

test('benchmarks require explicit researcher pairings and never count placeholders as validated passes', () => {
  const sites = adaptSites([
    site('gale', 'mars'),
    site('pending', 'earth', { benchmark: true }),
    site('known', 'earth', { benchmark: 'yes', expectedMarsIds: [], twin: 'gale' }),
    site('demo', 'earth', { benchmark: true, expectedMarsIds: ['gale'], name: 'FAKE demo' }),
  ])
  const report = validateBenchmarks(sites, { slope: 100 })
  assert.equal(report.total, 3)
  assert.equal(report.configured, 2)
  assert.equal(report.passed, 1)
  assert.equal(report.pending, 2)
  assert.equal(report.rows.find((row) => row.site.id === 'pending').status, 'unconfigured')
  assert.equal(report.rows.find((row) => row.site.id === 'known').status, 'pass')
  assert.equal(report.rows.find((row) => row.site.id === 'demo').status, 'placeholder')
})

test('benchmarks honestly report a configured example outside the top five', () => {
  const mars = site('gale', 'mars', { n: { slope: 0 } })
  const earth = Array.from({ length: 5 }, (_, index) => site(`better${index}`, 'earth', { n: { slope: 0 } }))
  earth.push(site('benchmark', 'earth', { n: { slope: 1 }, benchmark: true, twin: 'gale' }))
  const report = validateBenchmarks(adaptSites([mars, ...earth]), { slope: 100 })
  assert.equal(report.rows[0].rank, 6)
  assert.equal(report.rows[0].status, 'fail')
  assert.equal(report.passed, 0)
})

test('CSV export preserves sources and missing fields and escapes spreadsheet formulas', () => {
  const target = site('gale', 'mars')
  const candidate = adaptSites([site('csv', 'earth', { name: '=1+1', sources: [{ name: 'NASA', url: 'https://example.org/data' }], n: { slope: null } })])[0]
  const output = resultsToCsv(rankComparisons(target, [candidate], { slope: 100 }), target, { slope: 100 })
  assert.ok(output.includes('"\'=1+1"'))
  assert.ok(output.includes('https://example.org/data'))
  assert.ok(output.includes('resemblance_percent'))
  assert.ok(output.includes('"partial"'))
})

test('reference helpers reject executable links and accept complete DOIs', () => {
  assert.equal(safeExternalUrl('javascript:alert(1)'), null)
  assert.equal(safeExternalUrl('data:text/plain,test'), null)
  assert.equal(paperUrl({ doi: '10.2307/2528823' }), 'https://doi.org/10.2307/2528823')
  assert.equal(paperUrl({ doi: 'SAMPLE: replace this' }), null)
})

test('research handoff keeps paper URLs, unresolved identifiers and every coordinate source', () => {
  const [research] = adaptSites([site('gale_ez', 'mars', {
    papers: [
      'Assessing Gale crater as a landing site | https://www.hou.usra.edu/meetings/explorationzone2015/pdf/1020.pdf',
      'Ancient lake sediments | 10.1126/science.1242777',
      'Antarctic soil study | 20200001776',
      'Unresolved title | Another title | Third title',
    ],
    coord_source: 'https://example.org/coordinates | https://example.org/second | https://example.org/third',
    links: [{ label: 'Related paper', href: 'https://example.org/paper' }],
    sources: ['NASA terrain | https://example.org/dem', { name: 'Albedo', href: 'https://example.org/albedo' }, 'Unsafe | javascript:alert(1)'],
    limitations: 'Sampling scale differs; Field notes are incomplete',
  })])
  assert.equal(research.papers[0].href, 'https://www.hou.usra.edu/meetings/explorationzone2015/pdf/1020.pdf')
  assert.equal(research.papers[0].doi, undefined)
  assert.equal(research.papers[1].href, 'https://doi.org/10.1126/science.1242777')
  assert.equal(research.papers[2].identifier, '20200001776')
  assert.equal(research.papers[2].doi, undefined)
  assert.equal(research.papers[2].href, null)
  assert.equal(research.papers[3].href, null)
  assert.equal(research.papers[3].identifier, 'Another title | Third title')
  assert.equal(research.coord_source, 'https://example.org/coordinates')
  assert.deepEqual(research.coord_sources, ['https://example.org/coordinates', 'https://example.org/second', 'https://example.org/third'])
  assert.deepEqual(research.links.map((entry) => entry.href), ['https://example.org/paper', 'https://example.org/second', 'https://example.org/third'])
  assert.deepEqual(research.sources.map((entry) => entry.name), ['NASA terrain', 'Albedo'])
  assert.deepEqual(research.limitations, ['Sampling scale differs', 'Field notes are incomplete'])
  assert.equal(safeExternalUrl('https://example.org/a | https://example.org/b'), null)
  assert.equal(paperUrl('Human exploration study | https://example.org/study.pdf'), 'https://example.org/study.pdf')
})

test('research elevation filters use supplied raw measurements and preserve zero elevations', () => {
  const catalog = adaptSites([
    site('earth_target', 'earth'),
    site('raw_mars', 'mars', { raw: { elevation_m: -4500, ti: 364.4 } }),
    site('measured_mars', 'mars', { measurements: { elevation_m: '-2000' } }),
    site('zero_mars', 'mars', { elevation_m: 0, raw: { elevation_m: -3000 } }),
  ])
  assert.deepEqual(catalog.slice(1).map((entry) => entry.elevation_m), [-4500, -2000, 0])
  const results = rankComparisons(catalog[0], catalog, { slope: 100 }, { maxElevation: -1000 })
  assert.deepEqual(results.map((entry) => entry.site.id), ['measured_mars', 'raw_mars'])
  assert.equal(catalog[1].raw.ti, 364.4)
  const [missingNormalized] = adaptSites([site('raw_only', 'mars', { n: {}, raw: { ti: 364.4, slope_deg: 4 } })])
  assert.equal(missingNormalized.n.thermal, null)
  assert.equal(missingNormalized.n.slope, null)
})
