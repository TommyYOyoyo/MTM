const finite = (value) => typeof value === 'number' && Number.isFinite(value)
const positive = (value) => finite(value) && value > 0

function sourceUrl(value) {
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null
  } catch { return null }
}

// match the elevation grid to the selected site before drawing the 3d terrain
export function validateTerrain(data, site) {
  if (!data || typeof data !== 'object' || data.version !== 1) throw new Error('Unsupported terrain file.')
  if (!site || typeof site.id !== 'string' || data.siteId !== site.id || data.planet !== site.planet
    || !['earth', 'mars'].includes(data.planet)) throw new Error('Terrain does not belong to this location.')
  if (!finite(data.lat) || Math.abs(data.lat) > 90 || !finite(data.lon) || Math.abs(data.lon) > 180
    || !finite(site.lat) || !finite(site.lon)
    || Math.abs(data.lat - site.lat) > 1e-5 || Math.abs(data.lon - site.lon) > 1e-5) {
    throw new Error('Terrain coordinates do not match this location.')
  }
  if (!positive(data.radiusKm) || !positive(data.sizeXM) || !positive(data.sizeYM)) throw new Error('Terrain dimensions are invalid.')
  if (site.radius_km != null && (!positive(site.radius_km) || Math.abs(data.radiusKm - site.radius_km) > 1e-3)) {
    throw new Error('Terrain area does not match this location.')
  }
  if (!Number.isInteger(data.width) || !Number.isInteger(data.height)
    || data.width < 2 || data.width > 257 || data.height < 2 || data.height > 257
    || !Array.isArray(data.elevations) || data.elevations.length !== data.width * data.height) {
    throw new Error('Terrain grid dimensions are invalid.')
  }
  if (!data.source || typeof data.source.name !== 'string' || !data.source.name.trim()
    || !sourceUrl(data.source.url) || !positive(data.source.resolutionM)) {
    throw new Error('Terrain source information is missing or invalid.')
  }
  let min = Infinity
  let max = -Infinity
  let count = 0
  for (const elevation of data.elevations) {
    if (elevation === null) continue
    if (!finite(elevation) || elevation < -30000 || elevation > 30000) throw new Error('Terrain contains invalid elevations.')
    min = Math.min(min, elevation)
    max = Math.max(max, elevation)
    count += 1
  }
  if (count < 3) throw new Error('Terrain has too few elevation measurements.')
  return {
    ...data,
    source: { ...data.source, name: data.source.name.trim(), url: sourceUrl(data.source.url) },
    // Read the real elevations rather than trusting redundant file metadata.
    minElevationM: min,
    maxElevationM: max,
  }
}

export function terrainAssetPath(site) {
  if (typeof site?.id !== 'string' || !site.id.trim()) throw new Error('A location ID is required for terrain.')
  return `terrain/${encodeURIComponent(site.id)}.json`
}

// rows go north --> south (z goes up), triangles skip nodata holes
export function terrainGrid(data, exaggeration = 1) {
  if (!positive(exaggeration)) throw new Error('Terrain exaggeration must be a positive number.')
  const { width, height, sizeXM, sizeYM, elevations } = data
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2
    || width > 257 || height > 257 || !positive(sizeXM) || !positive(sizeYM)
    || !Array.isArray(elevations) || elevations.length !== width * height) {
    throw new Error('Terrain grid dimensions are invalid.')
  }
  let min = Infinity
  let max = -Infinity
  for (const elevation of elevations) {
    if (elevation === null) continue
    if (!finite(elevation) || elevation < -30000 || elevation > 30000) throw new Error('Terrain contains invalid elevations.')
    min = Math.min(min, elevation)
    max = Math.max(max, elevation)
  }
  if (!finite(min)) throw new Error('Terrain has no elevation measurements.')
  const baseline = (min + max) / 2
  const positions = new Float32Array(width * height * 3)
  const indices = []
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const index = row * width + column
      positions[index * 3] = column / (width - 1) * sizeXM - sizeXM / 2
      positions[index * 3 + 1] = elevations[index] === null ? 0 : (elevations[index] - baseline) * exaggeration
      positions[index * 3 + 2] = row / (height - 1) * sizeYM - sizeYM / 2
      if (row === height - 1 || column === width - 1) continue
      const east = index + 1
      const south = index + width
      const southeast = south + 1
      // Winding faces upward (+Y), and no triangle bridges a missing measurement.
      if ([index, south, east].every((vertex) => elevations[vertex] !== null)) indices.push(index, south, east)
      if ([east, south, southeast].every((vertex) => elevations[vertex] !== null)) indices.push(east, south, southeast)
    }
  }
  if (!indices.length) throw new Error('Terrain has no connected surface measurements.')
  return { positions, indices, min, max, baseline }
}
