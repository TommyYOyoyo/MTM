// satellite pictures for any site, built from its coordinates (no image files needed)

const EARTH_HALF_BOX = 0.5 // degrees around the site --> ~110 km wide picture
const MARS_ZOOM = 6 // trek tile level: 180 / 2^6 = 2.8125 deg per tile (~166 km)
const MARS_TILES = 'https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm'

// nasa worldview snapshot, modis true colour, same year as our modis measurements
export function earthSnapshot(lat, lon) {
  const box = [lat - EARTH_HALF_BOX, lon - EARTH_HALF_BOX, lat + EARTH_HALF_BOX, lon + EARTH_HALF_BOX].map((v) => v.toFixed(3)).join(',')
  return {
    src: `https://wvs.earthdata.nasa.gov/api/v1/snapshot?REQUEST=GetSnapshot&TIME=2023-07-15&BBOX=${box}&CRS=EPSG:4326&LAYERS=MODIS_Terra_CorrectedReflectance_TrueColor&WRAP=day&FORMAT=image/jpeg&WIDTH=480&HEIGHT=480`,
    caption: 'NASA Worldview · MODIS Terra true colour, Jul 2023 · ~110 km across',
  }
}

// 2x2 mars trek tiles around the site so the site ends up near the middle
export function marsMosaic(lat, lon) {
  const size = 180 / 2 ** MARS_ZOOM
  const cols = 2 ** (MARS_ZOOM + 1)
  const rows = 2 ** MARS_ZOOM

  // position in tile units (col 0 = 180W, row 0 = 90N)
  const x = (lon + 180) / size
  const y = (90 - lat) / size

  // pick the 2x2 block whose middle is closest to the site
  const left = Math.min(cols - 2, Math.max(0, Math.round(x) - 1))
  const top = Math.min(rows - 2, Math.max(0, Math.round(y) - 1))

  const tiles = []
  for (let row = top; row < top + 2; row += 1) {
    for (let col = left; col < left + 2; col += 1) tiles.push(`${MARS_TILES}/${MARS_ZOOM}/${row}/${col}.jpg`)
  }

  return {
    tiles,
    // where the site sits inside the 2x2 block, 0-1 (used to shift the picture)
    pointX: (x - left) / 2,
    pointY: (y - top) / 2,
    caption: 'NASA Mars Trek · Viking colour mosaic (MDIM 2.1) · ~170 km across',
  }
}

// real photos taken near the site, from wikimedia commons (geo tagged files within ~10 km)
const photoCache = new Map()
const SKIP = /map|locator|logo|diagram|chart|graph|sign|plan\b/i
const plainText = (html) => String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

export async function nearbyPhoto(lat, lon) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`
  if (photoCache.has(key)) return photoCache.get(key)

  const params = new URLSearchParams({
    action: 'query', generator: 'geosearch', ggscoord: `${lat}|${lon}`, ggsradius: '10000', ggslimit: '20', ggsnamespace: '6',
    prop: 'imageinfo', iiprop: 'url|mime|extmetadata', iiurlwidth: '640', format: 'json', origin: '*',
  })
  const request = fetch(`https://commons.wikimedia.org/w/api.php?${params}`)
    .then((response) => response.ok ? response.json() : null)
    .then((data) => {
      const pages = Object.values(data?.query?.pages || {})
      // closest first (geosearch gives an index), jpg photos only
      const photos = pages
        .filter((page) => page.imageinfo?.[0]?.mime === 'image/jpeg' && !SKIP.test(page.title))
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      const page = photos[0]
      if (!page) return null
      const info = page.imageinfo[0]
      const meta = info.extmetadata || {}
      return {
        src: info.thumburl || info.url,
        page: info.descriptionurl,
        author: plainText(meta.Artist?.value) || 'Unknown author',
        licence: plainText(meta.LicenseShortName?.value) || 'see file page',
        title: page.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '').replaceAll('_', ' '),
      }
    })
    .catch(() => null)

  photoCache.set(key, request)
  return request
}
