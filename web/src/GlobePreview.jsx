import { useEffect, useRef, useState } from 'react'
import Globe from './components/Globe.jsx'
import SolarSystem from './components/SolarSystem.jsx'
import './globe-preview.css'

const clockNow = () => performance.now()

function validSite(site, planet) {
  return site?.planet === planet
    && Number.isFinite(site.lat) && site.lat >= -90 && site.lat <= 90
    && Number.isFinite(site.lon) && site.lon >= -180 && site.lon <= 180
}

function safeLink(url) {
  try {
    const parsed = new URL(url)
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null
  } catch {
    return null
  }
}

function PlanetSwitch({ planet, onSelect, className, disabled }) {
  return (
    <div className={`preview-switch ${className}`} data-planet={planet || ''} role="group" aria-label="Choose a planet">
      {['earth', 'mars'].map((choice) => (
        <button key={choice} type="button" aria-pressed={planet === choice} disabled={disabled} onClick={() => onSelect(choice)}>
          {choice === 'mars' ? 'Mars' : 'Earth'}
        </button>
      ))}
    </div>
  )
}

export default function GlobePreview() {
  const [sites, setSites] = useState([])
  const [planet, setPlanet] = useState('mars')
  const [selectedId, setSelectedId] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [listCollapsed, setListCollapsed] = useState(true)
  const [earthEngine, setEarthEngine] = useState(null)
  const [solarMounted, setSolarMounted] = useState(false)
  const [globePlanets, setGlobePlanets] = useState(['mars'])
  const [solarVisible, setSolarVisible] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [spaceError, setSpaceError] = useState(false)
  const globeRefs = useRef({})
  const solarRef = useRef(null)
  const solarVisibleRef = useRef(false)
  const transitioningRef = useRef(false)
  const mountedRef = useRef(true)
  const searchRef = useRef(null)
  const listRef = useRef(null)
  const drawerGesture = useRef(null)
  const ignoreDrawerClick = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${import.meta.env.BASE_URL}sites.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Request failed (${response.status})`)
        return response.json()
      })
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('Site data must be an array')
        setSites(data)
      })
      .catch((problem) => {
        if (problem.name !== 'AbortError') setError(problem.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${import.meta.env.BASE_URL}earth-engine.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) return null
        return response.json()
      })
      .then((data) => {
        if (data?.sites && typeof data.sites === 'object' && !Array.isArray(data.sites)) setEarthEngine(data)
      })
      .catch(() => {}) // The Earth Engine export is optional.
    return () => controller.abort()
  }, [])

  const planetSites = sites.filter((site) => validSite(site, planet))
  const searchTerm = search.trim().toLocaleLowerCase()
  const searchResults = searchTerm
    ? planetSites.filter((site) => String(site.name || site.id).toLocaleLowerCase().includes(searchTerm))
    : []
  const selected = planetSites.find((site) => site.id === selectedId)
  const earthRecord = planet === 'earth' && selected ? earthEngine?.sites?.[selected.id] : null
  const earthData = Number.isFinite(earthRecord?.lat) && Number.isFinite(earthRecord?.lon)
    && Math.abs(earthRecord.lat - selected.lat) <= 1e-6
    && Math.abs(earthRecord.lon - selected.lon) <= 1e-6 ? earthRecord : null
  const earthSources = Array.isArray(earthEngine?.metadata?.sources)
    ? earthEngine.metadata.sources.filter((source) => source && typeof source === 'object')
      .map((source) => ({ ...source, href: safeLink(source.url) })).filter((source) => source.href)
    : []
  const earthContext = [
    Number.isFinite(earthEngine?.metadata?.year) ? earthEngine.metadata.year : null,
    Number.isFinite(earthEngine?.metadata?.radius_m) ? `${earthEngine.metadata.radius_m / 1000} km radius` : null,
  ].filter((value) => value !== null).join(' · ')
  const earthValues = earthData && typeof earthData === 'object' && !Array.isArray(earthData) ? [
    ['Elevation', earthData.elevation_m, 'm'],
    ['Slope', earthData.slope_deg, '°'],
    ['Albedo', earthData.albedo, ''],
    ['Day surface temp.', earthData.lst_day_c, '°C'],
    ['Night surface temp.', earthData.lst_night_c, '°C'],
    ['Day − night temp.', earthData.lst_day_night_c, '°C'],
  ] : null
  const sources = Array.isArray(selected?.sources)
    ? selected.sources.map((source) => ({ ...source, href: safeLink(source.url) })).filter((source) => source.href)
    : []
  const factors = [
    ['Slope', selected?.n?.slope],
    ['Albedo', selected?.n?.albedo],
    ['Thermal', selected?.n?.thermal],
  ]

  async function openSolarSystem() {
    if (transitioningRef.current || solarVisibleRef.current) return
    transitioningRef.current = true
    setTransitioning(true)
    setSolarMounted(true)
    setSpaceError(false)
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    try {
      let scene
      for (let attempts = 0; attempts < 400 && mountedRef.current; attempts += 1) {
        scene = solarRef.current
        if (scene) break
        await wait(20)
      }
      if (!scene) throw new Error('Solar system did not start')
      await Promise.race([scene.ready(), wait(8000).then(() => { throw new Error('Solar system did not start') })])
      // Start space at the view the user actually reached. It remains under
      // their control: a deliberate wheel or pinch continues the zoom.
      const view = globeRefs.current[planet]?.getView()
      await scene.prepareTravel(planet, view)
      if (!mountedRef.current) return
      setSelectedId(null)
      setSearch('')
      solarVisibleRef.current = true
      setSolarVisible(true)
    } catch {
      if (!mountedRef.current) return
      setSpaceError(true)
      solarVisibleRef.current = false
      setSolarVisible(false)
      setSolarMounted(false)
    } finally {
      transitioningRef.current = false
      if (mountedRef.current) setTransitioning(false)
    }
  }

  async function selectPlanet(nextPlanet, options = {}) {
    if (transitioningRef.current || (nextPlanet === planet && !solarVisibleRef.current)) return
    transitioningRef.current = true
    setTransitioning(true)
    setSpaceError(false)
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    const startedInSpace = solarVisibleRef.current
    try {
      // Prepare both scenes behind the current view; neither is shown until its
      // renderer has produced a frame, avoiding a black frame on planet changes.
      setGlobePlanets((current) => current.includes(nextPlanet) ? current : [...current, nextPlanet])
      setSolarMounted(true)
      const start = clockNow()
      if (!startedInSpace) globeRefs.current[planet]?.zoomOut(reducedMotion ? 0 : 1400)
      let scene
      for (let attempts = 0; attempts < 400 && mountedRef.current; attempts += 1) {
        scene = solarRef.current
        if (scene && globeRefs.current[nextPlanet]?.isReady()) break
        await wait(20)
      }
      if (!mountedRef.current) return
      if (!scene || !globeRefs.current[nextPlanet]?.isReady()) throw new Error('Planet view did not start')
      await Promise.race([
        scene.ready(),
        wait(8000).then(() => { throw new Error('Solar system did not start') }),
      ])
      if (startedInSpace && options.fromZoom) {
        // A pinch or wheel zoom already completed the approach. Continue at
        // exactly that angle and apparent size instead of flying in again.
        globeRefs.current[nextPlanet]?.setView(options.view)
        setPlanet(nextPlanet)
        setSearch('')
        setSelectedId(null)
        solarVisibleRef.current = false
        setSolarVisible(false)
        if (!reducedMotion) await wait(450)
        if (mountedRef.current) {
          setSolarMounted(false)
          setGlobePlanets([nextPlanet])
        }
        return
      }
      if (!startedInSpace) {
        const remaining = 1050 - (clockNow() - start)
        if (!reducedMotion && remaining > 0) await wait(remaining)
        await scene.prepareTravel(planet, globeRefs.current[planet]?.getView())
        if (!mountedRef.current) return
        setSelectedId(null)
        setSearch('')
        solarVisibleRef.current = true
        setSolarVisible(true)
      }
      // Prepare the final close-up behind the solar view. Start the blend while
      // the flight is still moving, and do not restart the zoom after arrival.
      globeRefs.current[nextPlanet]?.randomizeView(0)
      const destination = globeRefs.current[nextPlanet]?.getView()
      let fadeStarted = 0
      const finishTravel = () => {
        if (fadeStarted || !mountedRef.current) return
        fadeStarted = clockNow()
        setPlanet(nextPlanet)
        setSearch('')
        setSelectedId(null)
        solarVisibleRef.current = false
        setSolarVisible(false)
      }
      const journey = await scene.travel(planet, nextPlanet, {
        duration: reducedMotion ? 0 : nextPlanet === planet ? 1400 : 4200,
        targetCoordinates: destination,
        targetFraction: destination?.fraction || 1.3,
        onProgress: (progress) => { if (progress >= 0.92) finishTravel() },
      })
      if (journey?.cancelled) throw new Error('Solar system view unavailable')
      if (!mountedRef.current) return
      finishTravel()
      const fadeRemaining = 450 - (clockNow() - fadeStarted)
      if (!reducedMotion && fadeRemaining > 0) await wait(fadeRemaining)
      if (mountedRef.current) {
        setSolarMounted(false)
        setGlobePlanets([nextPlanet])
      }
    } catch {
      if (!mountedRef.current) return
      setSpaceError(true)
      solarVisibleRef.current = false
      setSolarVisible(false)
      setSolarMounted(false)
      setGlobePlanets([planet])
      globeRefs.current[planet]?.zoomIn(reducedMotion ? 0 : 700)
    } finally {
      transitioningRef.current = false
      if (mountedRef.current) setTransitioning(false)
    }
  }

  function selectLocation(id) {
    // Selecting the current site again should still return the camera to it.
    if (id === selectedId) globeRefs.current[planet]?.focusSite(id)
    setSelectedId(id)
  }

  function closeDetails() {
    const previousLocation = !listCollapsed && !searchTerm
      ? listRef.current?.querySelector('[aria-pressed="true"]')
      : null
    const focusTarget = previousLocation || searchRef.current
    if (selectedId && !solarVisibleRef.current) globeRefs.current[planet]?.randomizeView()
    setSelectedId(null)
    focusTarget?.focus()
  }

  function beginDrawerDrag(event) {
    if (!event.isPrimary || event.button !== 0) return
    ignoreDrawerClick.current = false
    drawerGesture.current = { pointerId: event.pointerId, startY: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function endDrawerDrag(event) {
    const gesture = drawerGesture.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    drawerGesture.current = null
    const distance = event.clientY - gesture.startY
    if (Math.abs(distance) >= 24) {
      ignoreDrawerClick.current = true
      setListCollapsed(distance > 0)
    }
  }

  function toggleDrawer(event) {
    if (ignoreDrawerClick.current && event.detail !== 0) {
      ignoreDrawerClick.current = false
      return
    }
    ignoreDrawerClick.current = false
    setListCollapsed((collapsed) => !collapsed)
  }

  return (
    <div className="preview-shell">
      <main className="preview-map" aria-label="Planet explorer">
        {!loading && !error && <div className={`preview-planet-layer${solarVisible ? ' is-hidden' : ''}`} aria-hidden={solarVisible} inert={solarVisible}>{globePlanets.map((name) => (
          <div key={name} style={{ position: 'absolute', inset: 0, opacity: name === planet ? 1 : 0, pointerEvents: name === planet ? 'auto' : 'none' }} aria-hidden={name !== planet} inert={name !== planet}>
            <Globe ref={(node) => { if (node) globeRefs.current[name] = node; else delete globeRefs.current[name] }} sites={sites} planet={name} selectedId={name === planet ? selectedId : null} onSelect={selectLocation} onSpace={name === planet ? openSolarSystem : undefined} showSiteList={false} initialAltitude={name === planet ? undefined : 0.9} fill />
          </div>
        ))}</div>}
        {solarMounted && <div className={`preview-solar-layer${solarVisible ? '' : ' is-hidden'}`} aria-hidden={!solarVisible} inert={!solarVisible}><SolarSystem ref={solarRef} planet={planet} sites={sites} onReturn={selectPlanet} /></div>}
        {loading && <p className="preview-message" role="status">Loading locations…</p>}
        {error && <p className="preview-message preview-error" role="alert">Unable to load locations: {error}</p>}
        {spaceError && <p className="preview-message preview-error" role="status">Solar system view unavailable.</p>}
      </main>
      <footer className="preview-beta"><span>Beta</span><span>© MTM 2026</span></footer>
      <div className={`preview-chrome${searchTerm ? ' is-searching' : ''}${solarVisible ? ' is-space' : ''}`}>
        {!solarVisible && !loading && !error && (
          <div className="preview-search">
            <input ref={searchRef} className={`preview-search-input${search ? ' has-query' : ''}`} type="search" aria-label="Search locations" placeholder="Search locations" value={search} onChange={(event) => setSearch(event.target.value)} />
            <svg className="preview-search-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10.75" cy="10.75" r="6.75" /><path d="m16 16 4.25 4.25" /></svg>
            {search && (
              <button className="preview-search-clear" type="button" aria-label="Clear search" onClick={() => { setSearch(''); searchRef.current?.focus() }}>
                <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 4l8 8M12 4l-8 8" /></svg>
              </button>
            )}
            {searchTerm && (
              <div className="preview-search-results">
                {searchResults.length ? searchResults.map((site) => (
                  <button className="preview-search-result" type="button" key={site.id} onClick={() => { selectLocation(site.id); setSearch('') }}>
                    {site.name || site.id}
                  </button>
                )) : <p className="preview-search-empty">No locations found</p>}
              </div>
            )}
          </div>
        )}
        <PlanetSwitch planet={solarVisible ? null : planet} onSelect={selectPlanet} className="preview-switch-main" disabled={transitioning} />
        {!solarVisible && !loading && !error && (
          <>
            <aside ref={listRef} className={`preview-list${listCollapsed ? ' is-collapsed' : ''}`} aria-label="Sample locations" hidden={Boolean(searchTerm)}>
              <button className="preview-drawer-handle" type="button" aria-label={listCollapsed ? 'Expand locations' : 'Collapse locations'} aria-expanded={!listCollapsed} aria-controls="preview-list-content" onPointerDown={beginDrawerDrag} onPointerUp={endDrawerDrag} onPointerCancel={() => { drawerGesture.current = null }} onClick={toggleDrawer}>
                <span className="preview-drawer-grip" aria-hidden="true" />
                <span className="preview-panel-title">Available locations<svg className="preview-location-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z" /><circle cx="12" cy="10" r="2.25" /></svg></span>
              </button>
              <PlanetSwitch planet={planet} onSelect={selectPlanet} className="preview-switch-mobile" disabled={transitioning} />
              <div id="preview-list-content" inert={listCollapsed} aria-hidden={listCollapsed}>
              {planetSites.length ? (
                <ol className="preview-site-list">
                  {planetSites.map((site, index) => (
                    <li key={site.id}>
                      <button className="preview-site-button" type="button" aria-pressed={site.id === selectedId} onClick={() => selectLocation(site.id)}>
                        <span className="preview-site-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                        <span className="preview-site-name">{site.name || site.id}</span>
                        <span className="preview-site-chevron" aria-hidden="true">›</span>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : <p className="preview-empty">No locations available.</p>}
              </div>
            </aside>
            {selected && <aside className="preview-sidebar" aria-label="Selected location">
              <div className="preview-panel-heading">
                <span className="preview-panel-title">LOCATION</span>
                <button className="preview-panel-toggle" type="button" aria-label="Close location details" onClick={closeDetails}><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 4l8 8M12 4l-8 8" /></svg></button>
              </div>
              <div id="preview-details-content">
                <div aria-live="polite">
              {selected ? (
                <div className="preview-selection">
                  <h1>{selected.name || selected.id}</h1>
                  <p className="preview-selection-meta">Test location</p>
                  <dl className="preview-coordinates">
                    <div><dt>Similarity</dt><dd>Not calculated</dd></div>
                    <div><dt>Latitude</dt><dd>{selected.lat.toFixed(2)}°</dd></div>
                    <div><dt>Longitude</dt><dd>{selected.lon.toFixed(2)}°</dd></div>
                  </dl>
                  {earthValues && (
                    <div className="preview-factors">
                      <p className="preview-sidebar-label">EARTH ENGINE DATA</p>
                      {earthContext && <p className="preview-selection-meta">{earthContext}</p>}
                      <dl className="preview-coordinates">
                        {earthValues.map(([name, value, unit]) => (
                          <div key={name}><dt>{name}</dt><dd>{Number.isFinite(value) ? `${value.toFixed(2)}${unit ? ` ${unit}` : ''}` : '—'}</dd></div>
                        ))}
                      </dl>
                      {earthSources.length > 0 && <ul className="preview-source-list">{earthSources.map((source) => <li key={source.href}><a href={source.href} target="_blank" rel="noreferrer">{source.name || 'Source'} ↗</a></li>)}</ul>}
                    </div>
                  )}
                  <div className="preview-factors">
                    <p className="preview-sidebar-label">SAMPLE VALUES · NORMALIZED</p>
                    <dl className="preview-coordinates">
                      {factors.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{Number.isFinite(value) ? value.toFixed(2) : 'Missing'}</dd></div>)}
                    </dl>
                  </div>
                  <div className="preview-sources">
                    <p className="preview-sidebar-label">SOURCES</p>
                    {sources.length ? <ul className="preview-source-list">{sources.map((source) => <li key={source.href}><a href={source.href} target="_blank" rel="noreferrer">{source.name || 'Source'} ↗</a></li>)}</ul> : <p className="preview-selection-meta">No sources provided</p>}
                    <ul className="preview-source-list"><li><a href={`${import.meta.env.BASE_URL}textures/solar/CREDITS.md`} target="_blank" rel="noreferrer">Planet imagery credits ↗</a></li></ul>
                  </div>
                </div>
              ) : <div className="preview-empty"><h1>Choose a location</h1></div>}
                </div>
              </div>
            </aside>}
          </>
        )}
      </div>
    </div>
  )
}
