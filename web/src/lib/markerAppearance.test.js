import assert from 'node:assert/strict'
import test from 'node:test'
import { markerAppearance } from './markerAppearance.js'

test('markers fade from solid to a clickable outline as the camera approaches', () => {
  assert.deepEqual(markerAppearance(1.8), { fill: 1, outline: 0 })
  assert.deepEqual(markerAppearance(0.46), { fill: 0.76, outline: 0 })
  assert.deepEqual(markerAppearance(0.12), { fill: 0.5, outline: 0.42 })
  assert.deepEqual(markerAppearance(0.04), { fill: 0, outline: 1 })
  assert.deepEqual(markerAppearance(0), { fill: 0, outline: 1 })
  assert.equal(markerAppearance(Number.NaN), null)
})
