import { useEffect, useState } from 'react'
import SiteAnalysis from './SiteAnalysis'
import { BaselineChart, KnownTag, RadarChart } from './MatchInsights.jsx'
import MetSparkline from './MetSparkline.jsx'
import { evidenceLevel, factorDrivers, nasaViewerLink } from '../lib/comparison.js'
import { earthSnapshot, marsMosaic, nearbyPhoto } from '../lib/siteImagery.js'
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
  if (factor === 'ice' && site.research_ice && site.research_ice !== site.ice) return `${cleanLabel(site.ice)} (${cleanLabel(site.research_ice)})`
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

function doiLink(value) {
  if (typeof value !== 'string') return null
  const stripped = value.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
  return /^10\.\d{4,9}\/\S+$/i.test(stripped) ? `https://doi.org/${encodeURI(stripped)}` : safeLink(value)
}

function SourceList({ items, empty }) {
  return items.length ? <ul className="comparison-detail-links">{items.map((item, index) => <li key={`${item.href || item.label}-${index}`}>{item.href ? <a href={item.href} target="_blank" rel="noreferrer">{item.label} <span aria-hidden="true">↗</span></a> : <span>{item.label}</span>}{item.agency && <span className="comparison-detail-muted"> · {item.agency}</span>}</li>)}</ul> : empty ? <p className="comparison-detail-muted">{empty}</p> : null
}

// mars view = 2x2 trek tiles, shifted so the site sits in the middle
function MarsView({ lat, lon, name }) {
  const [failed, setFailed] = useState(false)
  const view = marsMosaic(lat, lon)
  return <figure className="comparison-detail-image">
    {failed ? <div className="comparison-image-pending">Image unavailable</div> : <div className="site-view" role="img" aria-label={`Viking colour mosaic around ${name}`}>
      <div className="site-view-tiles" style={{ left: `${50 - view.pointX * 200}%`, top: `${50 - view.pointY * 200}%` }}>{view.tiles.map((src) => <img key={src} src={src} alt="" decoding="async" onError={() => setFailed(true)} />)}</div>
      <span className="site-view-marker" aria-hidden="true" />
    </div>}
    <figcaption>{view.caption}</figcaption>
  </figure>
}

function EarthView({ lat, lon, name }) {
  const [failed, setFailed] = useState(false)
  const view = earthSnapshot(lat, lon)
  return <figure className="comparison-detail-image">
    {failed ? <div className="comparison-image-pending">Image unavailable</div> : <div className="site-view"><img className="site-view-single" src={view.src} alt={`MODIS satellite view around ${name}`} decoding="async" onError={() => setFailed(true)} /><span className="site-view-marker" aria-hidden="true" /></div>}
    <figcaption>{view.caption}</figcaption>
  </figure>
}

// real photo near an earth site (wikimedia commons), with author + licence
function NearbyPhoto({ lat, lon, name }) {
  const [photo, setPhoto] = useState(undefined)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    nearbyPhoto(lat, lon).then((result) => { if (live) setPhoto(result) })
    return () => { live = false }
  }, [lat, lon])
  if (photo === undefined) return <figure className="comparison-detail-image"><div className="comparison-image-pending">Looking for photos near this site…</div></figure>
  if (!photo || failed) return null
  return <figure className="comparison-detail-image">
    <img src={photo.src} alt={`Photo near ${name}: ${photo.title}`} decoding="async" onError={() => setFailed(true)} />
    <figcaption>{/^ISS\d/.test(photo.title) ? 'ISS astronaut photo of the area' : 'Photo near the site'} · <a href={photo.page} target="_blank" rel="noreferrer">{photo.author}</a> · {photo.licence} · Wikimedia Commons</figcaption>
  </figure>
}

function SiteImage({ src, alt, caption }) {
  const [failed, setFailed] = useState(false)
  return <figure className="comparison-detail-image">{src && !failed ? <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} /> : <div className="comparison-image-pending">Image unavailable</div>}<figcaption>{caption}</figcaption></figure>
}

function copyText(text, setCopied) {
  try {
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }, () => {})
  } catch { /* no clipboard, skip */ }
}

function downloadSite(site) {
  const keep = ['id', 'name', 'planet', 'type', 'lat', 'lon', 'radius_km', 'ice', 'research_ice', 'tags', 'subsurface', 'benchmark', 'benchmarkTargets', 'use_case', 'papers', 'coord_source', 'raw', 'n', 'sampling', 'sources', 'hotspot', 'partner_observations']
  const data = Object.fromEntries(keep.filter((key) => site[key] !== undefined).map((key) => [key, site[key]]))
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `space-out-${site.id}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const MARS_SOURCES = { terrain: 'MOLA DEM · 463 m', albedo: 'TES · 7.4 km', thermal: 'TES night map · ~3 km', swim: 'SWIM · ±60° only', elevation: 'MOLA · above areoid' }

function dataGroups(site, { elevation, radius, sampling, swim, dayC, nightC, dayNightDifference }) {
  const mars = site.planet === 'mars'
  const dem = site.raw?.dem ? String(site.raw.dem) : 'NASADEM'
  const terrainSource = mars ? MARS_SOURCES.terrain : `${dem} → 463 m`
  const location = [
    ['Planet', mars ? 'Mars' : site.planet === 'earth' ? 'Earth' : 'Missing'],
    ['Type', cleanLabel(site.type) || 'Missing'],
    ['Latitude', number(site.lat, '°', 5)], ['Longitude', number(site.lon, '°', 5)],
    ['Area radius', number(radius, 'km')],
  ]
  if (mars || Number.isFinite(elevation)) location.push(['Elevation · not scored', number(elevation, 'm'), mars ? MARS_SOURCES.elevation : dem])
  const measured = [
    ['Slope', factorValue(site, 'slope'), terrainSource],
    ['Roughness', factorValue(site, 'roughness'), terrainSource],
    ['Albedo', factorValue(site, 'albedo'), mars ? MARS_SOURCES.albedo : 'MODIS MCD43A3 · 500 m'],
    [mars ? 'Thermal inertia' : 'Apparent thermal proxy', factorValue(site, 'thermal'), mars ? MARS_SOURCES.thermal : '(1 − albedo) / day–night ΔT'],
  ]
  if (mars) measured.push(['SWIM ice consistency · not scored', Number.isFinite(swim) ? `${swim > 0 ? '+' : ''}${number(swim)} (${swim >= 0.5 ? 'consistent with buried ice' : swim > 0 ? 'weakly consistent' : swim > -0.5 ? 'weakly inconsistent' : 'inconsistent with ice'})` : 'Outside coverage', MARS_SOURCES.swim])
  if (!mars && (Number.isFinite(dayC) || Number.isFinite(nightC))) measured.push(['Day surface temperature', number(dayC, '°C'), 'MODIS MOD11A2 · 1 km'], ['Night surface temperature', number(nightC, '°C'), 'MODIS MOD11A2 · 1 km'], ['Day − night difference', number(dayNightDifference, 'K')])
  const scored = ['slope', 'roughness', 'thermal', 'albedo', 'sun'].map((factor) => [FACTOR_NAMES[factor], Number.isFinite(site.n?.[factor]) ? `${number(site.n[factor], '', 3)} / 1` : 'Missing', factor === 'thermal' ? 'rank within planet' : factor === 'sun' ? 'latitude + axial tilt' : null])
  scored.push(['Ice', factorValue(site, 'ice')], ['Geology', factorValue(site, 'geology')], ['Subsurface', site.subsurface ? factorValue(site, 'subsurface') : 'Not scored', site.subsurface ? null : 'no source-verified cave or lava tube data yet'])
  const samplingRows = []
  if (sampling && Number.isFinite(sampling.radius_km)) samplingRows.push(['Measurement radius', number(sampling.radius_km, 'km')])
  if (sampling && Number.isFinite(sampling.terrain_scale_m)) samplingRows.push(['Terrain sampling scale', number(sampling.terrain_scale_m, 'm')])
  if (sampling && Number.isInteger(sampling.year)) samplingRows.push(['MODIS year', String(sampling.year)])
  return [{ title: 'Location', rows: location }, { title: 'Measured values', rows: measured }, { title: 'Scoring inputs (0–1)', rows: scored }, ...(samplingRows.length ? [{ title: 'Sampling', rows: samplingRows }] : [])]
}

export default function ComparisonDetails({ site, target = null, result = null, isPlaceholder = false, earthData = null, earthSources = [], comparisonKind = 'analog', families = null, twins = [], onCompareWith = null, baseline = null, known = null }) {
  const [copied, setCopied] = useState(false)
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
  const eeValues = [['Elevation', 'elevation_m', 'm'], ['Slope', 'slope_deg', '°'], ['Albedo', 'albedo', ''], ['Day surface temperature', 'lst_day_c', '°C'], ['Night surface temperature', 'lst_night_c', '°C'], ['Day − night', 'lst_day_night_c', '°C']]
  const partnerObservations = Array.isArray(site.partner_observations) ? site.partner_observations.filter((item) => item && typeof item === 'object') : []
  const terrainImage = imageLink(site.img || site.relief_img)
  const satelliteImage = imageLink(site.satellite_img)
  const hasCoords = Number.isFinite(site.lat) && Number.isFinite(site.lon)
  const dayC = temperatureC(site, 'day')
  const nightC = temperatureC(site, 'night')
  const dayNightDifference = rawValue(site, ['dT_k', 'lst_day_night_c', 'day_night_c', 'temperature_swing_c'])
  const sampling = site.sampling && typeof site.sampling === 'object' ? site.sampling : null
  const whySite = Boolean(site.use_case || list(site.pros).length || list(site.cons).length)
  const evidence = target && result ? evidenceLevel(result) : null
  const drivers = target && result ? factorDrivers(result) : []
  const viewer = nasaViewerLink(site)
  const sideBySide = Boolean(target && !samePlanet && hasCoords && Number.isFinite(target.lat) && Number.isFinite(target.lon))
  const swim = site.planet === 'mars' ? rawValue(site, ['subsurf_water', 'swim_c0_1']) : null

  return <div className="comparison-details">
    <h1>{site.name || site.id}</h1>
    <div className="comparison-detail-badges">{isPlaceholder && <span>Sample data</span>}{site.benchmark && <span>Benchmark</span>}{(site.discovery || site.type === 'discovery') && <span>Partial match · unreviewed</span>}{known && <KnownTag known={known} />}</div>
    {twins.length > 0 && <div className="comparison-twins"><span>{site.planet === 'earth' ? 'Published analog of' : 'Published Earth analogs'}</span>{twins.map((twin) => onCompareWith ? <button key={twin.id} type="button" onClick={() => onCompareWith(twin.id)}>{twin.name || twin.id} <span aria-hidden="true">›</span></button> : <strong key={twin.id}>{twin.name || twin.id}</strong>)}</div>}
    {site.hotspot && <p className="comparison-detail-muted">Part of {site.hotspot}: a cluster of nearby scan candidates found with DBSCAN.</p>}
    {site.dataIssues?.length > 0 && <p className="comparison-detail-muted">Excluded inputs: {site.dataIssues.join(', ')}.</p>}
    {target && <p className="comparison-detail-muted">Compared with {target.name || target.id}</p>}
    <div className="comparison-score-row"><span>Resemblance</span><strong>{Number.isFinite(result?.score) ? `${result.score.toFixed(1)}%` : '—'}</strong></div>
    <p className="comparison-score-note">{target ? `${isPlaceholder ? 'Illustrative score. ' : ''}Similarity across the selected factors; not a probability.` : 'Choose a target to compare.'}</p>
    {target && <p className="comparison-detail-muted">{usable.length}/{parts.length} active factors available{totalWeight > 0 ? ` · ${Math.round(usedWeight / totalWeight * 100)}% weighted coverage` : ''}</p>}
    {evidence && <p className="comparison-detail-muted comparison-evidence-line"><span className="comparison-evidence" data-level={evidence.level}>{evidence.label}</span> · {evidence.detail}</p>}
    {!samePlanet && <BaselineChart baseline={baseline} />}
    <SiteAnalysis site={site} families={families} />
    {target && <details className="comparison-detail-section" open><summary>Factor comparison</summary>
      {!samePlanet && <RadarChart target={target} site={site} />}
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
      {drivers.length > 0 && <div className="comparison-drivers"><p className="comparison-drivers-title">What drives this score <span>· change if the factor were removed</span></p><ul>{drivers.map((driver) => <li key={driver.factor}><span>{FACTOR_NAMES[driver.factor] || driver.label}</span><span className="comparison-driver-bar" aria-hidden="true"><i data-sign={driver.effect >= 0 ? 'up' : 'down'} style={{ width: `${Math.min(50, Math.abs(driver.effect) * 4)}%` }} /></span><span className="comparison-driver-value">{driver.effect >= 0 ? '+' : '−'}{Math.abs(driver.effect).toFixed(1)}</span></li>)}</ul></div>}
      <div className="comparison-match-break"><p><strong>Matches</strong>{matches.join(', ') || 'No exact factor matches'}</p><p><strong>Differences</strong>{differences.join(', ') || (usable.length ? 'No measured differences' : 'Missing comparison data')}</p></div>
    </details>}
    <details className="comparison-detail-section" open={!target || samePlanet}><summary>Site data</summary>
      <div className="comparison-data-actions">
        <button type="button" onClick={() => copyText(`${site.lat.toFixed(5)}, ${site.lon.toFixed(5)}`, setCopied)}>{copied ? 'Copied' : 'Copy coordinates'}</button>
        <button type="button" onClick={() => downloadSite(site)}>Download data (JSON)</button>
      </div>
      {dataGroups(site, { elevation, radius, sampling, swim, dayC, nightC, dayNightDifference }).map((group) => <div className="comparison-data-group" key={group.title}>
        <h3>{group.title}</h3>
        <dl className="comparison-data-list">{group.rows.map(([name, value, source]) => <div key={name}><dt>{name}</dt><dd>{value}{source && <small>{source}</small>}</dd></div>)}</dl>
      </div>)}
      <p className="comparison-score-note">Scoring inputs are the normalized 0–1 values compared by the resemblance score; measured values are the raw instrument numbers.{site.planet === 'mars' ? ' SWIM ranges from −1 to +1: how consistent orbital data are with buried ice.' : ''}</p>
      {sampling?.method && <p className="comparison-score-note">{String(sampling.method)}</p>}
    </details>
    {whySite && <details className="comparison-detail-section"><summary>Why this site</summary><div className="comparison-notes">{site.use_case && <p>{String(site.use_case)}</p>}{list(site.pros).length > 0 && <><h2>Strengths</h2><ul>{list(site.pros).map((note, i) => <li key={i}>{note}</li>)}</ul></>}{list(site.cons).length > 0 && <><h2>Tradeoffs</h2><ul>{list(site.cons).map((note, i) => <li key={i}>{note}</li>)}</ul></>}</div></details>}
    {sideBySide && <details className="comparison-detail-section" open><summary>Side by side</summary><div className="side-by-side">
      {[target, site].map((entry) => <div key={entry.id}><span className="side-by-side-label"><small>{entry === target ? 'Target' : 'Match'} · {entry.planet === 'mars' ? 'Mars' : 'Earth'}</small>{entry.name || entry.id}</span>{entry.planet === 'mars' ? <MarsView lat={entry.lat} lon={entry.lon} name={entry.name || entry.id} /> : <EarthView lat={entry.lat} lon={entry.lon} name={entry.name || entry.id} />}</div>)}
    </div><p className="comparison-score-note">Same marker, different windows: Viking colour mosaic (Mars) and MODIS true colour (Earth).</p></details>}
    {(terrainImage || satelliteImage || hasCoords) && <details className="comparison-detail-section" open={!target}><summary>Images</summary><div className="comparison-detail-gallery">{hasCoords && (site.planet === 'mars' ? <MarsView key={`${site.id}-mars`} lat={site.lat} lon={site.lon} name={site.name || site.id} /> : site.planet === 'earth' ? <><NearbyPhoto key={`${site.id}-photo`} lat={site.lat} lon={site.lon} name={site.name || site.id} /><EarthView key={`${site.id}-earth`} lat={site.lat} lon={site.lon} name={site.name || site.id} /></> : null)}{terrainImage && <SiteImage key={`${site.id}-relief-${terrainImage}`} src={terrainImage} alt={`Terrain around ${site.name || site.id}`} caption="Terrain" />}{satelliteImage && <SiteImage key={`${site.id}-satellite-${satelliteImage}`} src={satelliteImage} alt={`Satellite view of ${site.name || site.id}`} caption="Satellite" />}</div></details>}
    {earthData && <details className="comparison-detail-section"><summary>Earth Engine measurements</summary><dl className="comparison-data-list">{eeValues.map(([name, field, unit]) => <div key={field}><dt>{name}</dt><dd>{number(earthData[field], unit)}</dd></div>)}</dl><p className="comparison-score-note">Separate measurements; scoring uses the normalized site data.</p><SourceList items={eeLinks} empty="Dataset links pending." /></details>}
    {partnerObservations.length > 0 && <details className="comparison-detail-section"><summary>Partner observations</summary>{partnerObservations.map((observation, index) => <div key={index}><h2>{observation.agency ? `${String(observation.agency)} · ` : ''}{String(observation.name || 'Observations')}</h2>{Array.isArray(observation.series) && <MetSparkline series={observation.series} />}<dl className="comparison-data-list">{(Array.isArray(observation.measurements) ? observation.measurements : []).filter((measurement) => measurement && typeof measurement === 'object').map((measurement, itemIndex) => <div key={itemIndex}><dt>{String(measurement.label || 'Measurement')}</dt><dd>{number(measurement.value, measurement.unit)}</dd></div>)}</dl><SourceList items={safeLink(observation.url) ? [{ href: safeLink(observation.url), label: 'Observation source' }] : []} empty="" /></div>)}</details>}
    <details className="comparison-detail-section"><summary>{samePlanet ? 'Limits of the comparison' : 'Limits of the analogy'}</summary>{samePlanet ? <p className="comparison-score-note">Same-planet resemblance uses the available normalized inputs. Measurement scale, dates and missing factors affect this comparison. A high score does not establish that the sites are interchangeable.</p> : <><ul className="comparison-limit-list"><li>Mars gravity is about 0.38 of Earth’s.</li><li>Typical Mars surface pressure is under 1% of Earth’s.</li><li>Its thin atmosphere provides less shielding from solar radiation.</li><li>Liquid water cannot persist for long on the surface under typical current conditions.</li></ul><p className="comparison-score-note">Thermal ranks compare different quantities: Mars thermal inertia and Earth’s apparent proxy (1 − albedo) / annual day–night surface-temperature difference. These are not physically equivalent. Terrain statistics also depend on sampling scale and area.</p></>}{notes.length > 0 && <ul className="comparison-limit-list">{notes.map((note, i) => <li key={i}>{note}</li>)}</ul>}{!samePlanet && <SourceList items={[{ href: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html', label: 'NASA Mars fact sheet' }, { href: 'https://science.nasa.gov/mars/facts/', label: 'NASA Mars facts' }, { href: 'https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/mars/', label: 'NASA Mars environment' }]} empty="" />}</details>
    <details className="comparison-detail-section"><summary>Sources & papers</summary>{viewer && <SourceList items={[{ href: viewer.href, label: viewer.label, agency: 'NASA' }]} empty="" />}<SourceList items={sources} empty="Site dataset sources not supplied." /><SourceList items={papers} empty="Research papers not supplied." /><SourceList items={links} empty="" /><ul className="comparison-detail-links"><li><a href={`${import.meta.env.BASE_URL}textures/solar/CREDITS.md`} target="_blank" rel="noreferrer">Planet imagery credits ↗</a></li></ul></details>
  </div>
}
