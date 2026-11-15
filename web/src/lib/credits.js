export const TEAM = Object.freeze({
  name: 'Da Bricks',
  url: 'https://www.spaceappschallenge.org/2026/find-a-team/da-bricks/?tab=members',
  members: Object.freeze(['Lauredant Erving', 'Perline Shen', 'Honglue Zheng', 'Yuecheng Ma', 'Christopher Ezael', 'Hila Geris']),
})

const NASA_REFERENCES = [
  { name: 'Blue Marble: Next Generation', url: 'https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography-bathymetry/', agency: 'NASA Earth Observatory · Reto Stöckli, NASA Goddard Space Flight Center', detail: 'Earth imagery, topography and bathymetry; August 2004.' },
  { name: 'Viking merged colour mosaic', url: 'https://www.mars.asu.edu/data/mdim_color/', agency: 'NASA Viking Orbiter · USGS Astrogeology · ASU Mars Space Flight Facility', detail: 'Mars imagery and detail tiles.' },
  { name: 'NASA Planetary Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/', agency: 'NASA', detail: 'Orbital periods and relative planet sizes.' },
  { name: 'Mars facts', url: 'https://science.nasa.gov/mars/facts/', agency: 'NASA Science', detail: 'Gravity, atmosphere and limits of Earth–Mars analogies.' },
]

const OTHER_CREDITS = [
  { name: 'Solar System Scope textures', url: 'https://www.solarsystemscope.com/textures/', agency: 'Solar System Scope', detail: 'Illustrative Sun and other-planet maps and Saturn’s rings, based on NASA imagery with colour adjustments and filled gaps.' },
  { name: 'Creative Commons Attribution 4.0', url: 'https://creativecommons.org/licenses/by/4.0/', agency: 'Solar System Scope texture licence' },
  { name: 'Astronomy Engine', url: 'https://github.com/cosinekitty/astronomy', agency: 'Don Cross', detail: 'Planet positions calculated from the device clock; not live observations. Display distances and sizes are compressed for navigation.' },
  { name: 'Gower resemblance', url: 'https://doi.org/10.2307/2528823', agency: 'J. C. Gower, 1971', detail: 'Reference for comparing mixed numeric and categorical characteristics.' },
]

function safeUrl(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null } catch { return null }
}

function unique(items, seen = new Set()) {
  return items.flatMap((item) => {
    const url = safeUrl(item?.url || item?.href)
    if (!url || seen.has(url)) return []
    seen.add(url)
    return [{ ...item, url, name: item.name || item.label || 'Source' }]
  })
}

function nasaArchive(url) {
  const host = new URL(url).hostname
  return host === 'nasa.gov' || host.endsWith('.nasa.gov') || host === 'pds-geosciences.wustl.edu' || host === 'an.rsl.wustl.edu'
}

export function collectCredits(sites = []) {
  const seen = new Set()
  const datasets = unique(sites.flatMap((site) => Array.isArray(site.sources) ? site.sources : []), seen)
  const nasaData = datasets.filter((source) => /nasa/i.test(source.agency || '') || nasaArchive(source.url))
  const partnerData = datasets.filter((source) => !nasaData.includes(source))
  const nasaReferences = unique(NASA_REFERENCES, seen)
  const archiveLinks = sites.flatMap((site) => {
    const coordinates = [...(Array.isArray(site.coord_sources) ? site.coord_sources : []), site.coord_source]
      .map((value) => typeof value === 'string' ? { url: value, name: `Coordinates · ${site.name || site.id}` } : value)
    const links = [...coordinates, ...(site.links || []), ...(site.papers || [])]
    return links.flatMap((item) => {
      const url = safeUrl(item?.href || item?.url)
      return url && nasaArchive(url) ? [{ ...item, url, name: item.title || item.name || item.label || `NASA archive · ${site.name || site.id}` }] : []
    })
  })
  return { nasaData, partnerData, nasaReferences, nasaArchives: unique(archiveLinks, seen), otherCredits: unique(OTHER_CREDITS, seen) }
}
