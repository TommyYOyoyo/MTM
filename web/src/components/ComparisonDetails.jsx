import { useState } from 'react'
import './comparison-details.css'

const FACTOR_NAMES = { slope: 'Slope', albedo: 'Albedo', thermal: 'Thermal', sun: 'Sun', roughness: 'Roughness', ice: 'Ice', geology: 'Geology', subsurface: 'Subsurface' }
const MEASUREMENTS = {
  slope: [['slope_deg', 'slope'], '°'],
  albedo: [['albedo'], ''],
  thermal: [['thermal_inertia', 'thermal_inertia_j', 'ti'], 'J m⁻² K⁻¹ s⁻½'],
  roughness: [['roughness_m'], 'm'],
}

function safeLink(value) {
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null
  } catch { return null }
}

function imageLink(value) {
  if (typeof value !== 'string' || !value.trim()) return null
  const external = safeLink(value)
  if (external) return external
  if (/^(?:img|images|textures)\/[a-zA-Z0-9_./% -]+$/.test(value) && !value.includes('..')) return `${import.meta.env.BASE_URL}${value}`
  return null
}

function list(value) { return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : [] }
function cleanLabel(value) { return typeof value === 'string' ? value.replaceAll('_', ' ') : value }
function number(value, unit = '', digits = 2) { return Number.isFinite(value) ? `${value.toLocaleString(undefined, { maximumFractionDigits: digits })}${unit ? ` ${unit}` : ''}` : 'Missing' }

function rawValue(site, keys) {
  for (const values of [site?.measurements, site?.raw, site]) {
    for (const key of keys) {
      if (Number.isFinite(values?.[key])) return values[key]
    }
  }
  return null
}

function factorValue(site, factor) {
  if (!site) return '—'
  if (factor === 'geology') return list(site.tags).map(cleanLabel).join(', ') || 'Missing'
  if (factor === 'ice' || factor === 'subsurface') return cleanLabel(site[factor]) || 'Missing'
  if (factor === 'thermal' && site.planet === 'earth') {
    const proxy = rawValue(site, ['apparent_ti'])
    if (Number.isFinite(proxy)) return number(proxy, 'K⁻¹', 5)
    const rank = site.n?.thermal
    return Number.isFinite(rank) ? `${number(rank)} / 1` : 'Missing'
  }
  if (factor === 'roughness') {
    const degrees = rawValue(site, ['roughness_deg'])
    if (Number.isFinite(degrees)) return `${number(degrees, '°')} slope SD`
  }
  if (MEASUREMENTS[factor]) {
    const [keys, unit] = MEASUREMENTS[factor]
    const value = rawValue(site, keys)
    if (Number.isFinite(value)) return number(value, unit, factor === 'albedo' ? 4 : 2)
  }
  const value = site.n?.[factor]
  return Number.isFinite(value) ? `${number(value)} / 1` : 'Missing'
}

function temperatureC(site, period) {
  const celsius = rawValue(site, [`lst_${period}_c`])
  if (Number.isFinite(celsius)) return celsius
  const kelvin = rawValue(site, [`lst_${period}_k`])
  return Number.isFinite(kelvin) ? kelvin - 273.15 : null
}

function factorLabel(site, factor) {
  if (factor === 'thermal') return site.planet === 'earth' ? 'Apparent thermal proxy' : 'Thermal inertia'
  return FACTOR_NAMES[factor]
}

function doiLink(value) {
  if (typeof value !== 'string') return null
  const stripped = value.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
  return /^10\.\d{4,9}\/\S+$/i.test(stripped) ? `https://doi.org/${encodeURI(stripped)}` : safeLink(value)
}

function SourceList({ items, empty }) {
  return items.length ? <ul className="comparison-detail-links">{items.map((item, index) => <li key={`${item.href || item.label}-${index}`}>{item.href ? <a href={item.href} target="_blank" rel="noreferrer">{item.label} <span aria-hidden="true">↗</span></a> : <span>{item.label}</span>}{item.agency && <span className="comparison-detail-muted"> · {item.agency}</span>}</li>)}</ul> : empty ? <p className="comparison-detail-muted">{empty}</p> : null
}

function SiteImage({ src, alt, caption }) {
  const [failed, setFailed] = useState(false)
  return <figure className="comparison-detail-image">{src && !failed ? <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} /> : <div className="comparison-image-pending">Image unavailable</div>}<figcaption>{caption}</figcaption></figure>
}

export default function ComparisonDetails({ site, target = null, result = null, isPlaceholder = false, earthData = null, earthSources = [], comparisonKind = 'analog' }) {
  if (!site) return null
  const samePlanet = comparisonKind === 'same-planet' || Boolean(target && target.planet === site.planet)
  const parts = Array.isArray(result?.parts) ? result.parts : []
  const usable = parts.filter((part) => Number.isFinite(part.sim))
  const totalWeight = parts.reduce((sum, part) => sum + (Number.isFinite(part.weight) ? part.weight : 0), 0)
  const usedWeight = usable.reduce((sum, part) => sum + (Number.isFinite(part.weight) ? part.weight : 0), 0)
  const matches = usable.filter((part) => part.sim === 1).map((part) => FACTOR_NAMES[part.factor] || part.factor)
  const differences = usable.filter((part) => part.sim < 1).map((part) => FACTOR_NAMES[part.factor] || part.factor)
  const sources = (Array.isArray(site.sources) ? site.sources : []).map((source) => ({ href: safeLink(source?.href || source?.url), label: source?.name || 'Dataset', agency: source?.agency })).filter((source) => source.href)
  const papers = (Array.isArray(site.papers) ? site.papers : []).map((paper) => ({ href: safeLink(paper?.href) || doiLink(paper?.doi) || safeLink(paper?.url), label: paper?.title || paper?.doi || (typeof paper === 'string' ? paper : 'Paper') }))
  const links = (Array.isArray(site.links) ? site.links : []).map((link) => ({ href: safeLink(link?.href || link?.url), label: link?.label || link?.name || 'Related link' })).filter((link) => link.href)
  if (safeLink(site.coord_source)) links.push({ href: safeLink(site.coord_source), label: 'Coordinate source' })
  const eeLinks = earthSources.map((source) => ({ href: safeLink(source?.href || source?.url), label: source?.name || 'Earth dataset' })).filter((source) => source.href)
  const notes = [...new Set([...list(site.limits), ...list(site.limitations), ...(typeof site.notes === 'string' && site.notes.trim() ? [site.notes.trim()] : [])])]
  const elevation = rawValue(site, ['elevation_m'])
  const radius = Number.isFinite(site.radius_km) ? site.radius_km : Number.isFinite(site.radius_m) ? site.radius_m / 1000 : null
  const values = ['slope', 'albedo', 'thermal', 'sun', 'roughness', 'ice', 'geology', 'subsurface']
  const eeValues = [['Elevation', 'elevation_m', 'm'], ['Slope', 'slope_deg', '°'], ['Albedo', 'albedo', ''], ['Day surface temperature', 'lst_day_c', '°C'], ['Night surface temperature', 'lst_night_c', '°C'], ['Day − night', 'lst_day_night_c', '°C']]
  const partnerObservations = Array.isArray(site.partner_observations) ? site.partner_observations.filter((item) => item && typeof item === 'object') : []
  const terrainImage = imageLink(site.img || site.relief_img)
  const satelliteImage = imageLink(site.satellite_img)
  const dayC = temperatureC(site, 'day')
  const nightC = temperatureC(site, 'night')
  const dayNightDifference = rawValue(site, ['dT_k', 'lst_day_night_c', 'day_night_c', 'temperature_swing_c'])
  const sampling = site.sampling && typeof site.sampling === 'object' ? site.sampling : null
  const whySite = Boolean(site.use_case || list(site.pros).length || list(site.cons).length)

  return <div className="comparison-details">
    <h1>{site.name || site.id}</h1>
    <div className="comparison-detail-badges">{isPlaceholder && <span>Sample data</span>}{site.benchmark && <span>Benchmark</span>}{(site.discovery || site.type === 'discovery') && <span>Partial match · unreviewed</span>}</div>
    {site.dataIssues?.length > 0 && <p className="comparison-detail-muted">Excluded inputs: {site.dataIssues.join(', ')}.</p>}
    {target && <p className="comparison-detail-muted">Compared with {target.name || target.id}</p>}
    <div className="comparison-score-row"><span>Resemblance</span><strong>{Number.isFinite(result?.score) ? `${result.score.toFixed(1)}%` : '—'}</strong></div>
    <p className="comparison-score-note">{target ? `${isPlaceholder ? 'Illustrative score. ' : ''}Similarity across the selected factors; not a probability.` : 'Choose a target to compare.'}</p>
    {target && <p className="comparison-detail-muted">{usable.length}/{parts.length} active factors available{totalWeight > 0 ? ` · ${Math.round(usedWeight / totalWeight * 100)}% weighted coverage` : ''}</p>}
    {target && <details className="comparison-detail-section" open><summary>Factor comparison</summary>
      <div className="comparison-factors">{parts.length ? parts.map((part) => {
        const available = Number.isFinite(part.sim)
        const similarity = available ? Math.max(0, Math.min(1, part.sim)) : 0
        return <div className="comparison-factor" key={part.factor}>
          <div className="comparison-factor-heading"><span>{FACTOR_NAMES[part.factor] || cleanLabel(part.factor)}</span><span>{available ? `${Math.round(similarity * 100)}%` : 'Missing'}</span></div>
          <div className={`comparison-factor-track${available ? '' : ' is-missing'}`} role="img" aria-label={available ? `${FACTOR_NAMES[part.factor] || part.factor}: ${Math.round(similarity * 100)} percent similarity` : `${FACTOR_NAMES[part.factor] || part.factor}: missing data`}><span style={{ width: `${similarity * 100}%` }} /></div>
          <div className="comparison-factor-values"><span title={target.name}>Target: {factorValue(target, part.factor)}</span><span title={site.name}>Site: {factorValue(site, part.factor)}</span></div>
          {part.factor === 'thermal' && <p className="comparison-score-note">Scored by thermal rank within each planet’s supplied catalog.</p>}
        </div>
      }) : <p className="comparison-detail-muted">No factors enabled.</p>}</div>
      <div className="comparison-match-break"><p><strong>Matches</strong>{matches.join(', ') || 'No exact factor matches'}</p><p><strong>Differences</strong>{differences.join(', ') || (usable.length ? 'No measured differences' : 'Missing comparison data')}</p></div>
    </details>}
    <details className="comparison-detail-section" open={!target || samePlanet}><summary>Site data</summary><dl className="comparison-data-list">
      <div><dt>Planet</dt><dd>{site.planet === 'mars' ? 'Mars' : site.planet === 'earth' ? 'Earth' : 'Missing'}</dd></div>
      <div><dt>Type</dt><dd>{cleanLabel(site.type) || 'Missing'}</dd></div>
      <div><dt>Latitude</dt><dd>{number(site.lat, '°')}</dd></div><div><dt>Longitude</dt><dd>{number(site.lon, '°')}</dd></div>
      <div><dt>Area radius</dt><dd>{number(radius, 'km')}</dd></div>
      {(site.planet === 'mars' || Number.isFinite(elevation)) && <div><dt>Elevation · not scored</dt><dd>{number(elevation, 'm')}</dd></div>}
      {values.map((factor) => <div key={factor}><dt>{factorLabel(site, factor)}</dt><dd>{factorValue(site, factor)}</dd></div>)}
      {site.planet === 'earth' && (Number.isFinite(dayC) || Number.isFinite(nightC)) && <><div><dt>Day surface temperature</dt><dd>{number(dayC, '°C')}</dd></div><div><dt>Night surface temperature</dt><dd>{number(nightC, '°C')}</dd></div><div><dt>Day − night difference</dt><dd>{number(dayNightDifference, 'K')}</dd></div></>}
      {sampling && Number.isFinite(sampling.radius_km) && <div><dt>Measurement radius</dt><dd>{number(sampling.radius_km, 'km')}</dd></div>}
      {sampling && Number.isFinite(sampling.terrain_scale_m) && <div><dt>Terrain sampling scale</dt><dd>{number(sampling.terrain_scale_m, 'm')}</dd></div>}
      {sampling && Number.isInteger(sampling.year) && <div><dt>MODIS year</dt><dd>{sampling.year}</dd></div>}
    </dl><p className="comparison-score-note">Values shown as “/ 1” are normalized inputs.</p>{sampling?.method && <p className="comparison-score-note">{String(sampling.method)}</p>}</details>
    {whySite && <details className="comparison-detail-section"><summary>Why this site</summary><div className="comparison-notes">{site.use_case && <p>{String(site.use_case)}</p>}{list(site.pros).length > 0 && <><h2>Strengths</h2><ul>{list(site.pros).map((note, i) => <li key={i}>{note}</li>)}</ul></>}{list(site.cons).length > 0 && <><h2>Tradeoffs</h2><ul>{list(site.cons).map((note, i) => <li key={i}>{note}</li>)}</ul></>}</div></details>}
    {(terrainImage || satelliteImage) && <details className="comparison-detail-section"><summary>Images</summary><div className="comparison-detail-gallery">{terrainImage && <SiteImage key={`${site.id}-relief-${terrainImage}`} src={terrainImage} alt={`Terrain around ${site.name || site.id}`} caption="Terrain" />}{satelliteImage && <SiteImage key={`${site.id}-satellite-${satelliteImage}`} src={satelliteImage} alt={`Satellite view of ${site.name || site.id}`} caption="Satellite" />}</div></details>}
    {earthData && <details className="comparison-detail-section"><summary>Earth Engine measurements</summary><dl className="comparison-data-list">{eeValues.map(([name, field, unit]) => <div key={field}><dt>{name}</dt><dd>{number(earthData[field], unit)}</dd></div>)}</dl><p className="comparison-score-note">Separate measurements; scoring uses the normalized site data.</p><SourceList items={eeLinks} empty="Dataset links pending." /></details>}
    {partnerObservations.length > 0 && <details className="comparison-detail-section"><summary>Partner observations</summary>{partnerObservations.map((observation, index) => <div key={index}><h2>{observation.agency ? `${String(observation.agency)} · ` : ''}{String(observation.name || 'Observations')}</h2><dl className="comparison-data-list">{(Array.isArray(observation.measurements) ? observation.measurements : []).filter((measurement) => measurement && typeof measurement === 'object').map((measurement, itemIndex) => <div key={itemIndex}><dt>{String(measurement.label || 'Measurement')}</dt><dd>{number(measurement.value, measurement.unit)}</dd></div>)}</dl><SourceList items={safeLink(observation.url) ? [{ href: safeLink(observation.url), label: 'Observation source' }] : []} empty="" /></div>)}</details>}
    <details className="comparison-detail-section"><summary>{samePlanet ? 'Limits of the comparison' : 'Limits of the analogy'}</summary>{samePlanet ? <p className="comparison-score-note">Same-planet resemblance uses the available normalized inputs. Measurement scale, dates and missing factors affect this comparison. A high score does not establish that the sites are interchangeable.</p> : <><ul className="comparison-limit-list"><li>Mars gravity is about 0.38 of Earth’s.</li><li>Typical Mars surface pressure is under 1% of Earth’s.</li><li>Its thin atmosphere provides less shielding from solar radiation.</li><li>Liquid water cannot persist for long on the surface under typical current conditions.</li></ul><p className="comparison-score-note">Thermal ranks compare different quantities: Mars thermal inertia and Earth’s apparent proxy (1 − albedo) / annual day–night surface-temperature difference. These are not physically equivalent. Terrain statistics also depend on sampling scale and area.</p></>}{notes.length > 0 && <ul className="comparison-limit-list">{notes.map((note, i) => <li key={i}>{note}</li>)}</ul>}{!samePlanet && <SourceList items={[{ href: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html', label: 'NASA Mars fact sheet' }, { href: 'https://science.nasa.gov/mars/facts/', label: 'NASA Mars facts' }, { href: 'https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/mars/', label: 'NASA Mars environment' }]} empty="" />}</details>
    <details className="comparison-detail-section"><summary>Sources & papers</summary><SourceList items={sources} empty="Site dataset sources not supplied." /><SourceList items={papers} empty="Research papers not supplied." /><SourceList items={links} empty="" /><ul className="comparison-detail-links"><li><a href={`${import.meta.env.BASE_URL}textures/solar/CREDITS.md`} target="_blank" rel="noreferrer">Planet imagery credits ↗</a></li></ul></details>
  </div>
}
