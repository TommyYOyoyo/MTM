import test from 'node:test'
import assert from 'node:assert/strict'
import { terrainAssetPath, terrainGrid, validateTerrain } from './terrainData.js'

const site = { id: 'gale', planet: 'mars', lat: -4.589467, lon: 137.441633, radius_km: 5 }
const terrain = (extra = {}) => ({
  version: 1, siteId: site.id, planet: site.planet, lat: site.lat, lon: site.lon,
  radiusKm: 5, sizeXM: 10000, sizeYM: 10000, width: 2, height: 2,
  elevations: [-4500, -4490, -4480, -4470],
  minElevationM: 0, maxElevationM: 0,
  source: { name: 'MOLA', url: 'https://example.org/mola', resolutionM: 463 },
  ...extra,
})

test('terrain validation binds a genuine grid and recomputes its actual elevation range', () => {
  const data = validateTerrain(terrain(), site)
  assert.equal(data.minElevationM, -4500)
  assert.equal(data.maxElevationM, -4470)
  assert.deepEqual(data.elevations, [-4500, -4490, -4480, -4470])
  assert.doesNotThrow(() => validateTerrain(terrain({ lat: site.lat + 0.000001 }), site))
})

test('terrain rejects wrong location, planet, coordinates and extraction radius', () => {
  for (const extra of [{ siteId: 'jezero' }, { planet: 'earth' }, { lat: 10 }, { lon: null }, { radiusKm: 6 }]) {
    assert.throws(() => validateTerrain(terrain(extra), site), /match|belong|dimensions/)
  }
  assert.throws(() => validateTerrain(terrain({ version: 2 }), site), /Unsupported/)
})

test('terrain enforces bounded grid sizes, physical dimensions and attribution', () => {
  for (const extra of [{ width: 1 }, { width: 258 }, { height: 2.5 }, { elevations: [1, 2] }, { sizeXM: 0 }, { sizeYM: Infinity }]) {
    assert.throws(() => validateTerrain(terrain(extra), site), /dimensions/)
  }
  for (const source of [null, { name: 'MOLA', url: 'javascript:alert(1)', resolutionM: 463 }, { name: '', url: 'https://example.org', resolutionM: 463 }, { name: 'MOLA', url: 'https://example.org', resolutionM: null }]) {
    assert.throws(() => validateTerrain(terrain({ source }), site), /source/)
  }
})

test('NoData is explicitly null and cannot masquerade as a numeric elevation', () => {
  const data = validateTerrain(terrain({ elevations: [null, 0, 1, 2] }), site)
  assert.equal(data.minElevationM, 0)
  for (const bad of [NaN, Infinity, undefined, '10', -30001, 30001]) {
    assert.throws(() => validateTerrain(terrain({ elevations: [bad, 0, 1, 2] }), site), /elevations/)
  }
  assert.throws(() => validateTerrain(terrain({ elevations: [null, null, 1, 2] }), site), /too few/)
})

test('mesh uses real metric dimensions, row orientation, upward winding and elevation exaggeration', () => {
  const grid = terrainGrid(validateTerrain(terrain(), site), 2)
  assert.ok(grid.positions instanceof Float32Array)
  assert.deepEqual([...grid.positions], [-5000, -30, -5000, 5000, -10, -5000, -5000, 10, 5000, 5000, 30, 5000])
  assert.deepEqual(grid.indices, [0, 2, 1, 1, 2, 3])
  assert.equal(grid.min, -4500)
  assert.equal(grid.max, -4470)
  assert.equal(grid.baseline, -4485)
  assert.throws(() => terrainGrid(terrain(), 0), /exaggeration/)
})

test('mesh omits each triangle touching NoData and rejects disconnected grids', () => {
  assert.deepEqual(terrainGrid(terrain({ elevations: [null, 1, 2, 3] })).indices, [1, 2, 3])
  assert.throws(() => terrainGrid(terrain({ elevations: [1, null, null, 3] })), /connected/)
  assert.throws(() => terrainGrid(terrain({ elevations: [null, null, null, null] })), /no elevation/)
})

test('terrain URLs safely encode researcher IDs', () => {
  assert.equal(terrainAssetPath(site), 'terrain/gale.json')
  assert.equal(terrainAssetPath({ id: 'site / A?#' }), 'terrain/site%20%2F%20A%3F%23.json')
  assert.throws(() => terrainAssetPath({ id: '' }), /ID/)
})
