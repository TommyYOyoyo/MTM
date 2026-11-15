import { useEffect, useMemo, useRef, useState } from 'react'
import Globe from './Globe.jsx'
import SiteTerrain from './SiteTerrain.jsx'
import ComparisonDetails from './ComparisonDetails.jsx'
import { compareSites } from '../lib/comparison.js'
import { chooseDualPair, validDualSites } from '../lib/dualComparison.js'
import './dual-comparison.css'

const planetName = (planet) => planet === 'earth' ? 'Earth' : 'Mars'

function earthMeasurements(site, earthEngine) {
  if (site?.planet !== 'earth') return null
  const record = earthEngine?.sites?.[site.id]
  return Number.isFinite(record?.lat) && Number.isFinite(record?.lon)
    && Math.abs(record.lat - site.lat) <= 1e-6
    && Math.abs(record.lon - site.lon) <= 1e-6 ? record : null
}

function ComparisonPane({ side, planet, sites, site, opposite, result, onSelect, earthEngine, earthSources }) {
  const [view, setView] = useState('planet')
  const globeRef = useRef(null)
  const mapSites = useMemo(() => site ? [site] : [], [site])
  const label = side === 'left' ? 'Left' : 'Right'
  const choices = sites.filter((item) => item.id !== opposite?.id)

  return <section className="dual-comparison-pane" aria-label={`${label} location`}>
    <header className="dual-location-header">
      <label className="dual-location-select">
        <span className="dual-sr-only">{label} location</span>
        <select aria-label={`${label} location`} value={site?.id || ''} disabled={!choices.length} onChange={(event) => onSelect(event.target.value)}>
          {!site && <option value="">{choices.length ? 'Choose a location' : sites.length ? 'No other locations available' : `No ${planetName(planet)} locations available`}</option>}
          {choices.map((item) => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}
        </select>
      </label>
      <div className="dual-view-switch" role="group" aria-label={`${label} map view`}>
        <button type="button" aria-pressed={view === 'planet'} onClick={() => setView('planet')}>Planet</button>
        <button type="button" aria-pressed={view === 'terrain'} disabled={!site} onClick={() => setView('terrain')}>Terrain</button>
      </div>
    </header>
    <div className="dual-location-map">
      {view === 'planet' ? <>
        <Globe ref={globeRef} sites={mapSites} planet={planet} selectedId={site?.id || null} onSelect={() => site && globeRef.current?.focusSite(site.id)} showSiteList={false} fill />
        {site && <button type="button" className="dual-location-center" aria-label={`Center on ${label.toLowerCase()} location`} title="Center on location" onClick={() => globeRef.current?.focusSite(site.id)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3" /></svg>
        </button>}
      </> : <SiteTerrain key={`${planet}-${site?.id || 'empty'}`} site={site} planet={planet} />}
    </div>
    <div className="dual-location-data" tabIndex={0} aria-label={`${label} location data`}>
      {site ? <ComparisonDetails
        key={site.id}
        site={site}
        comparisonKind="same-planet"
        target={opposite || null}
        result={result}
        isPlaceholder={Boolean(site.placeholder || opposite?.placeholder || result?.placeholder)}
        earthData={earthMeasurements(site, earthEngine)}
        earthSources={earthSources}
      /> : <p className="dual-location-empty" role="status">{sites.length === 1 ? 'Add another location to compare.' : `No ${planetName(planet)} locations available.`}</p>}
    </div>
  </section>
}

export default function DualComparison({ sites = [], initialPlanet = 'mars', initialSelectedId = null, weights, onClose, earthEngine = null, earthSources = [] }) {
  const [planet, setPlanet] = useState(initialPlanet === 'earth' ? 'earth' : 'mars')
  const [pair, setPair] = useState(() => chooseDualPair(sites, initialPlanet === 'earth' ? 'earth' : 'mars', initialSelectedId))
  const closeRef = useRef(null)
  const available = validDualSites(sites, planet)
  const fallback = chooseDualPair(available, planet, pair[0])
  const left = available.find((site) => site.id === pair[0]) || available.find((site) => site.id === fallback[0]) || null
  const right = available.find((site) => site.id === pair[1] && site.id !== left?.id)
    || available.find((site) => site.id !== left?.id) || null
  const leftResult = left && right ? compareSites(right, left, weights) : null
  const rightResult = left && right ? compareSites(left, right, weights) : null

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Dual comparison · MTM'
    closeRef.current?.focus()
    const escape = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', escape)
    return () => {
      document.title = previousTitle
      window.removeEventListener('keydown', escape)
    }
  }, [onClose])

  function changePlanet(next) {
    if (next === planet) return
    setPlanet(next)
    setPair(chooseDualPair(sites, next))
  }

  function changeLocation(side, id) {
    if (!available.some((site) => site.id === id)) return
    if (side === 'left' && id !== right?.id) setPair([id, right?.id || null])
    if (side === 'right' && id !== left?.id) setPair([left?.id || null, id])
  }

  return <main className="dual-comparison" aria-labelledby="dual-comparison-title">
    <header className="dual-comparison-header">
      <button ref={closeRef} type="button" className="dual-back-button" onClick={onClose} aria-label="Close dual comparison">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7" /></svg><span>Back</span>
      </button>
      <h1 id="dual-comparison-title">Dual comparison</h1>
      <div className="dual-planet-switch" role="group" aria-label="Dual comparison planet">
        {['earth', 'mars'].map((choice) => <button key={choice} type="button" aria-pressed={planet === choice} onClick={() => changePlanet(choice)}>{planetName(choice)} / {planetName(choice)}</button>)}
      </div>
    </header>
    {available.length === 1 && <p className="dual-comparison-notice" role="status">One {planetName(planet)} location available. A second location is needed.</p>}
    <div className="dual-comparison-panes">
      <ComparisonPane key={`left-${planet}`} side="left" planet={planet} sites={available} site={left} opposite={right} result={leftResult} onSelect={(id) => changeLocation('left', id)} earthEngine={earthEngine} earthSources={earthSources} />
      <ComparisonPane key={`right-${planet}`} side="right" planet={planet} sites={available} site={right} opposite={left} result={rightResult} onSelect={(id) => changeLocation('right', id)} earthEngine={earthEngine} earthSources={earthSources} />
    </div>
  </main>
}
