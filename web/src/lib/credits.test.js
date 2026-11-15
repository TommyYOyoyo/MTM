import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { collectCredits, TEAM } from './credits.js'
import { adaptSites } from './comparison.js'

test('creators follow the official Da Bricks member order and spelling', () => {
  assert.equal(TEAM.name, 'Da Bricks')
  assert.deepEqual(TEAM.members, ['Lauredant Erving', 'Perline Shen', 'Honglue Zheng', 'Yuecheng Ma', 'Christopher Ezael', 'Hila Geris'])
  assert.ok(TEAM.url.endsWith('/da-bricks/?tab=members'))
})

test('credits include all production datasets with NASA and partner attribution kept distinct', () => {
  const sites = adaptSites(JSON.parse(readFileSync(new URL('../../public/sites.json', import.meta.url), 'utf8')))
  const credits = collectCredits(sites)
  assert.equal(credits.nasaData.length, 7)
  assert.equal(credits.partnerData.length, 1)
  assert.match(credits.partnerData[0].name, /Copernicus/)
  const all = Object.values(credits).flat()
  assert.equal(new Set(all.map((source) => source.url)).size, all.length)
  assert.ok(all.some((source) => source.url.includes('blue-marble')))
  assert.ok(all.some((source) => source.url.includes('mdim_color')))
  assert.ok(all.some((source) => source.url.includes('creativecommons.org')))
  assert.ok(all.some((source) => source.url.includes('cosinekitty/astronomy')))
})

test('credits deduplicate sources and reject executable links', () => {
  const result = collectCredits([{ name: 'One', sources: [
    { name: 'Valid', agency: 'NASA', url: 'https://nasa.gov/data' },
    { name: 'Duplicate', agency: 'NASA', href: 'https://nasa.gov/data' },
    { name: 'Unsafe', agency: 'NASA', url: 'javascript:alert(1)' },
  ], coord_source: 'javascript:alert(1)', links: [{ url: 'https://example.org/not-nasa' }] }])
  assert.equal(result.nasaData.length, 1)
  assert.equal(result.nasaArchives.length, 0)
})
