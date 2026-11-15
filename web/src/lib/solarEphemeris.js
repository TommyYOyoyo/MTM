import { Body, HelioVector, RotateVector, Rotation_EQJ_ECL } from 'astronomy-engine'

// The positions are modelled heliocentric coordinates, not a live data feed.
// Astronomy Engine: https://github.com/cosinekitty/astronomy
// Orbital periods and relative diameters: https://nssdc.gsfc.nasa.gov/planetary/factsheet/
// `radius` is an intentionally exaggerated display size, in scene units.
export const PLANETS = Object.freeze([
  { id: 'mercury', name: 'Mercury', body: Body.Mercury, periodDays: 88.0, radiusEarth: 0.383, radius: 0.25, color: '#a6a19b' },
  { id: 'venus', name: 'Venus', body: Body.Venus, periodDays: 224.7, radiusEarth: 0.949, radius: 0.33, color: '#e4c5a0' },
  { id: 'earth', name: 'Earth', body: Body.Earth, periodDays: 365.2, radiusEarth: 1, radius: 0.35, color: '#84afd0' },
  { id: 'mars', name: 'Mars', body: Body.Mars, periodDays: 687.0, radiusEarth: 0.532, radius: 0.3, color: '#c9795d' },
  { id: 'jupiter', name: 'Jupiter', body: Body.Jupiter, periodDays: 4331, radiusEarth: 11.209, radius: 0.7, color: '#d2b6a0' },
  { id: 'saturn', name: 'Saturn', body: Body.Saturn, periodDays: 10747, radiusEarth: 9.449, radius: 0.62, color: '#ddc79d' },
  { id: 'uranus', name: 'Uranus', body: Body.Uranus, periodDays: 30589, radiusEarth: 4.007, radius: 0.47, color: '#a2d3d4' },
  { id: 'neptune', name: 'Neptune', body: Body.Neptune, periodDays: 59800, radiusEarth: 3.883, radius: 0.45, color: '#7294d1' },
].map(Object.freeze))

const ECLIPTIC_ROTATION = Rotation_EQJ_ECL()
const DAY_MS = 86_400_000

function dateValue(date) {
  const value = date instanceof Date ? date.getTime() : NaN
  if (!Number.isFinite(value)) throw new TypeError('An actual, valid Date is required.')
  return value
}

function eclipticPosition(body, date) {
  const vector = RotateVector(ECLIPTIC_ROTATION, HelioVector(body, date))
  return { x: vector.x, y: vector.y, z: vector.z }
}

/** Sun-centred J2000 ecliptic positions in AU at the supplied device time. */
export function planetPositions(date = new Date()) {
  dateValue(date)
  return PLANETS.map(({ body, ...planet }) => ({ ...planet, ...eclipticPosition(body, date) }))
}

/**
 * Sample one approximate sidereal period of modelled heliocentric positions.
 * This is a time-sampled trajectory, not an exact static osculating ellipse;
 * perturbations may leave a small gap where its endpoints meet.
 */
export function orbitPath(id, date = new Date(), segments = 180) {
  const planet = PLANETS.find((item) => item.id === id)
  if (!planet) throw new RangeError(`Unknown planet: ${id}`)
  const time = dateValue(date)
  if (!Number.isInteger(segments) || segments < 3 || segments > 720) throw new RangeError('Segments must be an integer from 3 to 720.')
  return Array.from({ length: segments + 1 }, (_, index) =>
    eclipticPosition(planet.body, new Date(time + index * planet.periodDays * DAY_MS / segments)))
}
