import test from 'node:test'
import assert from 'node:assert/strict'
import { beatsBaseline, distanceKm, histogram, nearestKnown, nullBaseline } from './insights.js'

const mars = { id: 'm', planet: 'mars', lat: 0, lon: 0, n: { slope: 0.1, albedo: 0.2, thermal: 0.5, sun: 1, roughness: 0.1 } }
const earth = (id, lat, lon, slope) => ({ id, name: id, planet: 'earth', lat, lon, n: { slope, albedo: 0.2, thermal: 0.5, sun: 1, roughness: 0.1 } })
const weights = { slope: 1, albedo: 1, thermal: 1, sun: 1, roughness: 0, ice: 1, geology: 1, subsurface: 0 }

test('distance on the equator is about 111 km per degree', () => {
  assert.ok(Math.abs(distanceKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }) - 111.2) < 0.5)
})

test('nearest known tags known, near and new ground', () => {
  const known = [earth('a_bm', 0, 0, 0.1)]
  assert.equal(nearestKnown(known[0], known).tag, 'known')
  assert.equal(nearestKnown(earth('b', 0, 2, 0.1), known).tag, 'near')
  assert.equal(nearestKnown(earth('c', 40, 40, 0.1), known).tag, 'new')
})

test('baseline: a perfect twin beats the worse random places', () => {
  const random = [earth('r1', 0, 0, 0.9), earth('r2', 0, 0, 0.6), earth('r3', 0, 0, 0.1)]
  const baseline = nullBaseline(mars, random, weights)
  assert.equal(baseline.count, 3)
  const beat = beatsBaseline(baseline, mars, earth('twin', 0, 0, 0.1))
  assert.equal(Math.round(beat.share * 3), 2)
})

test('histogram puts 100 in the last bin', () => {
  const bins = histogram([0, 4, 99, 100])
  assert.equal(bins[0].count, 2)
  assert.equal(bins.at(-1).count, 2)
})
