import test from 'node:test'
import assert from 'node:assert/strict'
import { matchCharacteristics } from './src/components/explorerMatching.js'

const target = { n: { slope: 0, albedo: 0.5, thermal: 1, sun: 1 } }
test('identical available numeric factors score 100, including zero', () => {
  assert.equal(matchCharacteristics({ n: target.n }, target).score, 100)
})
test('missing and invalid factors are skipped and remaining weights renormalized', () => {
  const result = matchCharacteristics({ n: { slope: 0, albedo: null, thermal: 0, sun: NaN } }, target)
  assert.equal(result.score, 50)
  assert.equal(result.compared, 2)
  assert.equal(result.parts.find(part => part.factor === 'albedo').sim, null)
})
test('no available factors produces no score instead of zero', () => {
  assert.equal(matchCharacteristics({ n: {} }, target).score, null)
})
test('ice and geology are included only when requested', () => {
  const site = { n: {}, ice: 'ground_ice', tags: ['clay', 'basaltic', 'clay'] }
  const result = matchCharacteristics(site, { n: {}, ice: 'ground_ice', tags: ['clay'] })
  assert.equal(result.score, 75)
  assert.equal(result.compared, 2)
  assert.equal(matchCharacteristics(site, { n: {} }).score, null)
})
