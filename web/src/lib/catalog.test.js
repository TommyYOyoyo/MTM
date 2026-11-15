import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { adaptSites, rankComparisons, validateBenchmarks } from './comparison.js'

const catalog = JSON.parse(readFileSync(new URL('../../public/sites.json', import.meta.url), 'utf8'))
const sites = adaptSites(catalog)
const earth = sites.filter((site) => site.planet === 'earth')
const mars = sites.filter((site) => site.planet === 'mars')

test('the complete research catalog reaches the interface without test rows or silent omissions', () => {
  assert.equal(catalog.length, 36)
  assert.equal(sites.length, catalog.length)
  assert.equal(earth.length, 23)
  assert.equal(mars.length, 13)
  assert.equal(new Set(sites.map((site) => site.id)).size, sites.length)
  assert.ok(sites.every((site) => !site.placeholder && !site.dataIssues.length))
  assert.ok(sites.some((site) => site.id === 'green_valley_ez'))
  assert.ok(sites.every((site) => site.sources.length > 0))
})

test('every research target ranks the full opposite-planet catalog using usable real inputs', () => {
  for (const target of sites) {
    const results = rankComparisons(target, sites)
    assert.equal(results.length, target.planet === 'mars' ? earth.length : mars.length)
    assert.ok(results.every((row) => !row.placeholder && row.site.planet !== target.planet))
    assert.ok(results.every((row) => Number.isFinite(row.score) && row.score >= 0 && row.score <= 100))
    assert.ok(results.every((row) => row.coverage > 0 && row.coverage <= 100))
  }
})

test('real Mars elevations feed the filter and all six research benchmark pairings resolve', () => {
  assert.ok(mars.every((site) => Number.isFinite(site.elevation_m)))
  const results = rankComparisons(earth[0], sites, undefined, { maxElevation: 0 })
  assert.ok(results.length > 0 && results.length < mars.length)
  assert.ok(results.every((row) => row.site.elevation_m <= 0))
  const report = validateBenchmarks(sites)
  assert.equal(report.total, 6)
  assert.equal(report.pending, 0)
  assert.ok(report.rows.every((row) => row.target && ['pass', 'fail'].includes(row.status)))
})

test('the Earth export is bound to actual catalog coordinates and converts kelvin exactly once', () => {
  const exported = JSON.parse(readFileSync(new URL('../../public/earth-engine.json', import.meta.url), 'utf8'))
  assert.deepEqual(Object.keys(exported.sites).sort(), earth.map((site) => site.id).sort())
  for (const site of earth) {
    const row = exported.sites[site.id]
    assert.equal(row.lat, site.lat)
    assert.equal(row.lon, site.lon)
    assert.ok(Math.abs(row.lst_day_c - (site.raw.lst_day_k - 273.15)) < 1e-8)
    assert.ok(Math.abs(row.lst_night_c - (site.raw.lst_night_k - 273.15)) < 1e-8)
    assert.ok(Math.abs(row.lst_day_night_c - site.raw.dT_k) < 1e-8)
  }
})

test('unverified ice stays unknown and polar thermal ranks remain excluded', () => {
  for (const id of ['qaidam_basin_bm', 'sambhar_salt_lake_new_site', 'karapinar_new_site', 'wells_new_site', 'tuya_new_site']) {
    assert.equal(sites.find((site) => site.id === id)?.ice, null)
  }
  assert.ok(earth.filter((site) => Math.abs(site.lat) > 60).every((site) => site.n.thermal === null))
  assert.equal(sites.find((site) => site.id === 'university_valley_bm').ice, 'permafrost')
})
