import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseDualPair, validDualSites } from './dualComparison.js'
import { compareSites } from './comparison.js'

const site = (id, planet, extra = {}) => ({ id, name: id, planet, lat: 10, lon: 20, ...extra })

test('dual views accept bounded coordinates only on the requested planet', () => {
  const sites = [
    site('mars', 'mars'), site('earth', 'earth'),
    site('edge', 'mars', { lat: -90, lon: 180 }),
    site('missing', 'mars', { lat: null }),
    site('string', 'mars', { lat: '10' }),
    site('infinite', 'mars', { lon: Infinity }),
    site('bad-lat', 'mars', { lat: 90.1 }),
    site('bad-lon', 'mars', { lon: -180.1 }),
    null,
  ]
  assert.deepEqual(validDualSites(sites, 'mars').map(({ id }) => id), ['mars', 'edge'])
  assert.deepEqual(validDualSites(sites, 'earth').map(({ id }) => id), ['earth'])
  assert.deepEqual(validDualSites(sites, 'moon'), [])
  assert.deepEqual(validDualSites(null, 'earth'), [])
})

test('pair selection preserves a valid preferred site and never duplicates it', () => {
  const sites = [site('a', 'mars'), site('b', 'mars'), site('c', 'mars'), site('earth', 'earth')]
  assert.deepEqual(chooseDualPair(sites, 'mars', 'c'), ['c', 'a'])
  assert.deepEqual(chooseDualPair(sites, 'mars', 'a'), ['a', 'b'])
  assert.deepEqual(chooseDualPair(sites, 'mars', 'earth'), ['a', 'b'])
  assert.deepEqual(chooseDualPair(sites, 'mars', 'deleted'), ['a', 'b'])
})

test('empty and incomplete catalogs stay empty instead of inventing another site', () => {
  assert.deepEqual(chooseDualPair([], 'earth'), ['', ''])
  assert.deepEqual(chooseDualPair([site('only', 'earth')], 'earth'), ['only', ''])
  assert.deepEqual(chooseDualPair([site('unlocated', 'earth', { lat: null })], 'earth'), ['', ''])
  assert.deepEqual(chooseDualPair([site('a', 'mars'), site('a', 'mars')], 'mars'), ['a', ''])
  assert.deepEqual(validDualSites([site('', 'mars'), site(' ', 'mars')], 'mars'), [])
})

for (const planet of ['earth', 'mars']) {
  test(`${planet}-to-${planet} comparison reuses the existing weighted score symmetrically`, () => {
    const a = site('a', planet, { n: { slope: 0.2, albedo: 0.3 } })
    const b = site('b', planet, { n: { slope: 0.4, albedo: 0.3 } })
    const weights = { slope: 75, albedo: 25 }
    const result = compareSites(a, b, weights)
    assert.equal(result.score, 85)
    assert.equal(result.coverage, 100)
    assert.deepEqual(result.parts.map(({ factor, sim }) => [factor, sim]), [['slope', 0.8], ['albedo', 1]])
    assert.equal(compareSites(b, a, weights).score, result.score)
  })
}

test('same-planet comparisons keep missing data and sample flags visible', () => {
  const a = site('a', 'mars', { n: { slope: 0.2, albedo: 0.3 }, placeholder: true })
  const b = site('b', 'mars', { n: { slope: 0.2, albedo: null } })
  const result = compareSites(a, b, { slope: 40, albedo: 60 })
  assert.equal(result.score, 100)
  assert.equal(result.coverage, 40)
  assert.equal(result.partial, true)
  assert.equal(result.placeholder, true)
  assert.deepEqual(result.missingFactors, ['albedo'])
  const noMeasurements = compareSites(a, site('empty', 'mars'), { slope: 100 })
  assert.equal(noMeasurements.score, null)
  assert.equal(noMeasurements.coverage, 0)
})
