import test from 'node:test'
import assert from 'node:assert/strict'
import { PLANETS, orbitPath, planetPositions } from './solarEphemeris.js'

test('Earth and Mars positions agree with JPL Horizons in the J2000 ecliptic frame', () => {
  // Horizons geometric heliocentric vectors (AU), 2026-11-15 00:00 UT,
  // centre 500@10, target 399/499, REF_PLANE=ECLIPTIC, OUT_UNITS=AU-D.
  // https://ssd-api.jpl.nasa.gov/doc/horizons.html
  const reference = {
    earth: [0.6055566746478663, 0.7823299630150140, -0.0000506353111077],
    mars: [-0.4710872085957731, 1.537688773430219, 0.0437753096867865],
  }
  const positions = planetPositions(new Date('2026-11-15T00:00:00Z'))
  assert.equal(positions.length, 8)
  for (const [id, expected] of Object.entries(reference)) {
    const planet = positions.find((item) => item.id === id)
    for (const [index, axis] of ['x', 'y', 'z'].entries()) {
      assert.ok(Math.abs(planet[axis] - expected[index]) < 2e-5, `${id}.${axis} differs from JPL reference`)
    }
  }
})

test('orbital positions advance with time and sampled paths start at the planet', () => {
  const now = new Date('2026-11-15T00:00:00Z')
  const tomorrow = new Date('2026-11-16T00:00:00Z')
  const positions = planetPositions(now)
  for (const planet of PLANETS) {
    const position = positions.find((item) => item.id === planet.id)
    const next = planetPositions(tomorrow).find((item) => item.id === planet.id)
    assert.notDeepEqual([position.x, position.y, position.z], [next.x, next.y, next.z])
    const path = orbitPath(planet.id, now, 24)
    assert.equal(path.length, 25)
    assert.deepEqual(path[0], { x: position.x, y: position.y, z: position.z })
    assert.ok(path.every((point) => [point.x, point.y, point.z].every(Number.isFinite)))
  }
})

test('rejects invalid inputs instead of silently drawing incorrect positions', () => {
  assert.throws(() => planetPositions(new Date('invalid')), TypeError)
  assert.throws(() => orbitPath('unknown', new Date()), RangeError)
  assert.throws(() => orbitPath('mars', new Date(), 2), RangeError)
})
