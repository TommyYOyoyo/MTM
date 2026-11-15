import { useEffect, useRef, useState } from 'react'
import Globe from './components/Globe.jsx'
import SolarSystem from './components/SolarSystem.jsx'
import ComparisonControls from './components/ComparisonControls.jsx'
import MobileComparisonPage from './components/MobileComparisonPage.jsx'
import ComparisonDetails from './components/ComparisonDetails.jsx'
import ResearchTools from './components/ResearchTools.jsx'
import { DEFAULT_WEIGHTS } from './lib/constants.js'
import { adaptSites, compareSites, normalizeWeights, rankComparisons, resultsToCsv, validateBenchmarks, WEIGHT_PRESETS } from './lib/comparison.js'
import './globe-preview.css'
import './comparison-ui.css'
import './mobile-location.css'

const clockNow = () => performance.now()

function locationRoute() {
  try { return window.location.hash.startsWith('#location=') ? decodeURIComponent(window.location.hash.slice(10)) : null } catch { return null }
}

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
  const [targetId, setTargetId] = useState('')
  const [weights, setWeights] = useState(() => normalizeWeights(DEFAULT_WEIGHTS))
  const [presetId, setPresetId] = useState('equal')
  const [listView, setListView] = useState('browse')
  const [minCoverage, setMinCoverage] = useState(0)
  const [benchmarkOnly, setBenchmarkOnly] = useState(false)
  const [elevationLimit, setElevationLimit] = useState(null)
  const [discovery, setDiscovery] = useState([])
  const [families, setFamilies] = useState(null)
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 35rem)').matches)
  const [locationPageId, setLocationPageId] = useState(locationRoute)
  const [comparisonPage, setComparisonPage] = useState(() => window.location.hash === '#compare')
  const sitesRef = useRef([])
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
  const mobileBackRef = useRef(null)
  const comparisonMenuRef = useRef(null)
  const listRef = useRef(null)
  const drawerGesture = useRef(null)
  const ignoreDrawerClick = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 35rem)')
    const resize = (event) => setIsMobile(event.matches)
    const navigate = () => {
      const comparing = window.location.hash === '#compare'
      setComparisonPage(comparing)
      if (comparing) return
      const id = locationRoute()
      const site = sitesRef.current.find((item) => item.id === id)
      setLocationPageId(site ? id : null)
      setSelectedId(site ? id : null)
      if (site) {
        setPlanet(site.planet)
        setGlobePlanets([site.planet])
        solarVisibleRef.current = false
        setSolarVisible(false)
        setSolarMounted(false)
      }
    }
    media.addEventListener('change', resize)
    window.addEventListener('popstate', navigate)
    window.addEventListener('hashchange', navigate)
    return () => {
      media.removeEventListener('change', resize)
      window.removeEventListener('popstate', navigate)
      window.removeEventListener('hashchange', navigate)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${import.meta.env.BASE_URL}sites.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Request failed (${response.status})`)
        return response.json()
      })
      .then((data) => {
        if (!Array.isArray(data) && !Array.isArray(data?.sites)) throw new Error('Site data must be an array or an object with a sites array')
        const adapted = adaptSites(data)
        setSites(adapted)
        sitesRef.current = adapted
        const routedSite = adapted.find((site) => site.id === locationRoute())
        if (routedSite) {
          setSelectedId(routedSite.id)
          setPlanet(routedSite.planet)
          setGlobePlanets([routedSite.planet])
        }
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
    async function optionalData(file) {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}${file}`, { signal: controller.signal })
        return response.ok && response.headers.get('content-type')?.includes('json') ? await response.json() : null
      } catch { return null }
    }
    optionalData('discovery.json').then((data) => {
      if (!controller.signal.aborted && data) setDiscovery(adaptSites(Array.isArray(data) ? data : { ...data, sites: data.sites || data.candidates || [] }, { discovery: true }))
    })
    optionalData('families.json').then((data) => {
      if (!controller.signal.aborted) setFamilies(data)
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

  const mode = planet === 'earth' ? 'mars-to-earth' : 'earth-to-mars'
  const targetPlanet = mode === 'mars-to-earth' ? 'mars' : 'earth'
  const candidatePlanet = targetPlanet === 'mars' ? 'earth' : 'mars'
  const targets = sites.filter((site) => validSite(site, targetPlanet)
    && (targetPlanet !== 'mars' || elevationLimit === null
      || Number.isFinite(site.elevation_m) && site.elevation_m <= elevationLimit))
  const target = targets.find((site) => site.id === targetId) || null
  const planetSites = sites.filter((site) => validSite(site, planet))
  const sampleData = sites.some((site) => site.placeholder)
  const candidates = sites.filter((site) => validSite(site, candidatePlanet))
  const rankingOptions = { minCoverage, benchmarkOnly, ...(candidatePlanet === 'mars' && elevationLimit !== null ? { maxElevation: elevationLimit } : {}) }
  const ranked = target ? rankComparisons(target, candidates, weights, rankingOptions) : []
  const discoveryCandidates = discovery.filter((site) => validSite(site, 'earth') && (!site.targetId || site.targetId === targetId))
  const discovered = target?.planet === 'mars' ? rankComparisons(target, discoveryCandidates, weights, { minCoverage }) : []
  const visibleResults = listView === 'discovery' ? discovered : ranked
  const globeSites = listView === 'discovery' ? [...sites, ...discovery.filter((site) => !sites.some((existing) => existing.id === site.id))] : sites
  const highlightIds = target && planet === candidatePlanet ? visibleResults.slice(0, 5).map((result) => result.site.id) : []
  const searchTerm = search.trim().toLocaleLowerCase()
  const searchResults = searchTerm
    ? globeSites.filter((site) => validSite(site, planet) && String(site.name || site.id).toLocaleLowerCase().includes(searchTerm))
    : []
  const selected = globeSites.find((site) => validSite(site, planet) && site.id === selectedId)
  const selectedResult = selected && target && selected.planet !== target.planet ? compareSites(target, selected, weights) : null
  const mobileDetail = isMobile && Boolean(locationPageId && selected) && !solarVisible
  const mobileComparison = isMobile && comparisonPage
  const benchmarkReport = validateBenchmarks(sites)

  useEffect(() => {
    document.title = mobileComparison ? 'Compare · MTM' : mobileDetail ? `${selected.name} · MTM` : 'MTM Globe Preview'
    if (!mobileDetail) return undefined
    const frame = requestAnimationFrame(() => mobileBackRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [mobileComparison, mobileDetail, selected?.name])
  const earthRecord = planet === 'earth' && selected ? earthEngine?.sites?.[selected.id] : null
  const earthData = Number.isFinite(earthRecord?.lat) && Number.isFinite(earthRecord?.lon)
    && Math.abs(earthRecord.lat - selected.lat) <= 1e-6
    && Math.abs(earthRecord.lon - selected.lon) <= 1e-6 ? earthRecord : null
  const earthSources = Array.isArray(earthEngine?.metadata?.sources)
    ? earthEngine.metadata.sources.filter((source) => source && typeof source === 'object')
      .map((source) => ({ ...source, href: safeLink(source.url) })).filter((source) => source.href)
    : []

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
      clearLocationPage()
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

  async function beginComparison(id) {
    if (!id) { setTargetId(''); setSelectedId(null); return }
    const point = sites.find((site) => site.id === id)
    if (!point || transitioningRef.current) return
    const nextPlanet = point.planet === 'mars' ? 'earth' : 'mars'
    clearLocationPage()
    setTargetId(id)
    setBenchmarkOnly(false)
    setListView('matches')
    setListCollapsed(false)
    setSearch('')
    setSelectedId(null)
    await selectPlanet(nextPlanet)
  }

  function applyPreset(id) {
    const preset = WEIGHT_PRESETS.find((item) => item.id === id)
    if (!preset) return
    setWeights(normalizeWeights(preset.weights))
    setPresetId(id)
  }

  function changeElevation(value) {
    setElevationLimit(value)
    if (target?.planet === 'mars' && value !== null && (!Number.isFinite(target.elevation_m) || target.elevation_m > value)) setTargetId('')
  }

  function openMobileComparison() {
    if (transitioningRef.current) return
    searchRef.current?.blur()
    window.history.pushState({ ...window.history.state, mtmComparison: true }, '', `${window.location.pathname}${window.location.search}#compare`)
    setComparisonPage(true)
  }

  function closeMobileComparison() {
    setComparisonPage(false)
    if (window.location.hash === '#compare') {
      if (window.history.state?.mtmComparison) window.history.back()
      else window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
    }
    requestAnimationFrame(() => comparisonMenuRef.current?.focus())
  }

  function applyMobileComparison(settings) {
    if (transitioningRef.current) return
    setTargetId(settings.targetId)
    setWeights(settings.weights)
    setPresetId(settings.presetId)
    setElevationLimit(settings.elevationLimit)
    setBenchmarkOnly(false)
    setSearch('')
    setSelectedId(null)
    setLocationPageId(null)
    setListView('matches')
    setListCollapsed(false)
    closeMobileComparison()
  }

  function exportResults() {
    if (!target) return
    const url = URL.createObjectURL(new Blob([resultsToCsv(visibleResults, target, weights)], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `mtm-${target.id}-${listView === 'discovery' ? 'discovery' : 'matches'}.csv`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function selectResult(id) {
    if (transitioningRef.current) return
    if (planet !== candidatePlanet || solarVisibleRef.current) await selectPlanet(candidatePlanet)
    selectLocation(id)
  }

  function selectLocation(id) {
    // Selecting the current site again should still return the camera to it.
    if (id === selectedId) globeRefs.current[planet]?.focusSite(id)
    setSelectedId(id)
    if (window.matchMedia('(max-width: 35rem)').matches) {
      setListCollapsed(true)
      if (locationRoute() !== id) window.history.pushState({ ...window.history.state, mtmLocation: true }, '', `${window.location.pathname}${window.location.search}#location=${encodeURIComponent(id)}`)
      setLocationPageId(id)
    }
  }

  function clearLocationPage() {
    if (locationRoute()) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
    setLocationPageId(null)
  }

  function closeDetails() {
    const previousLocation = !listCollapsed && !searchTerm
      ? listRef.current?.querySelector('[aria-pressed="true"]')
      : null
    const focusTarget = previousLocation || searchRef.current
    if (selectedId && !solarVisibleRef.current) globeRefs.current[planet]?.randomizeView()
    setSelectedId(null)
    if (locationPageId) {
      setLocationPageId(null)
      if (window.history.state?.mtmLocation) window.history.back()
      else clearLocationPage()
    }
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
    <div className={`preview-shell${mobileDetail ? ' is-mobile-detail' : ''}${mobileComparison ? ' is-mobile-comparison' : ''}`}>
      {mobileDetail && <header className="mobile-location-header"><button ref={mobileBackRef} type="button" className="mobile-location-back" aria-label="Back to map" onClick={closeDetails}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7" /></svg><span>Back</span></button><h1 className="mobile-location-title">{selected.name}</h1></header>}
      {mobileDetail && <button type="button" className="mobile-location-center" aria-label="Center on selected location" title="Center on location" onClick={() => globeRefs.current[planet]?.focusSite(selected.id)}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3" /></svg></button>}
      <main className="preview-map" aria-label="Planet explorer" inert={mobileComparison} aria-hidden={mobileComparison}>
        {!loading && !error && <div className={`preview-planet-layer${solarVisible ? ' is-hidden' : ''}`} aria-hidden={solarVisible} inert={solarVisible}>{globePlanets.map((name) => (
          <div key={name} style={{ position: 'absolute', inset: 0, opacity: name === planet ? 1 : 0, pointerEvents: name === planet ? 'auto' : 'none' }} aria-hidden={name !== planet} inert={name !== planet}>
            <Globe ref={(node) => { if (node) globeRefs.current[name] = node; else delete globeRefs.current[name] }} sites={mobileDetail ? globeSites.filter((site) => site.id === selectedId) : globeSites} planet={name} selectedId={name === planet ? selectedId : null} highlightIds={name === planet ? highlightIds : []} onSelect={selectLocation} onSpace={name === planet ? openSolarSystem : undefined} showSiteList={false} initialAltitude={name === planet ? undefined : 0.9} fill />
          </div>
        ))}</div>}
        {solarMounted && <div className={`preview-solar-layer${solarVisible ? '' : ' is-hidden'}`} aria-hidden={!solarVisible} inert={!solarVisible}><SolarSystem ref={solarRef} planet={planet} sites={sites} onReturn={selectPlanet} /></div>}
        {loading && <p className="preview-message" role="status">Loading locations…</p>}
        {error && <p className="preview-message preview-error" role="alert">Unable to load locations: {error}</p>}
        {spaceError && <p className="preview-message preview-error" role="status">Solar system view unavailable.</p>}
      </main>
      <footer className="preview-beta"><span>Beta</span><span>© MTM 2026</span></footer>
      <div className={`preview-chrome${searchTerm ? ' is-searching' : ''}${solarVisible ? ' is-space' : ''}`} inert={mobileComparison} aria-hidden={mobileComparison}>
        {!solarVisible && !loading && !error && (
          <div className="preview-search">
            <input ref={searchRef} className={`preview-search-input${search ? ' has-query' : ''}`} type="search" aria-label="Search locations" placeholder="Search locations" value={search} onChange={(event) => setSearch(event.target.value)} />
            <svg className="preview-search-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="10.75" cy="10.75" r="6.75" /><path d="m16 16 4.25 4.25" /></svg>
            <button ref={comparisonMenuRef} className="preview-search-menu" type="button" aria-label="Open comparison settings" onClick={openMobileComparison} disabled={transitioning}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg></button>
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
        {!isMobile && !solarVisible && !loading && !error && <ComparisonControls mode={mode} targetId={target?.id || ''} onTargetChange={beginComparison} targets={targets} weights={weights} onWeightsChange={(next) => { setWeights(next); setPresetId('custom') }} presetId={presetId} onPresetChange={applyPreset} elevationLimit={elevationLimit} onElevationLimitChange={changeElevation} disabled={transitioning} placeholder={sampleData} />}
        {!solarVisible && !loading && !error && (
          <>
            <aside ref={listRef} className={`preview-list${listCollapsed ? ' is-collapsed' : ''}`} aria-label="Sample locations" hidden={Boolean(searchTerm)}>
              <button className="preview-drawer-handle" type="button" aria-label={listCollapsed ? 'Expand locations' : 'Collapse locations'} aria-expanded={!listCollapsed} aria-controls="preview-list-content" onPointerDown={beginDrawerDrag} onPointerUp={endDrawerDrag} onPointerCancel={() => { drawerGesture.current = null }} onClick={toggleDrawer}>
                <span className="preview-drawer-grip" aria-hidden="true" />
                <span className="preview-panel-title">{listView === 'browse' ? 'Available locations' : listView === 'checks' ? 'Research checks' : 'Analog matches'}<svg className="preview-location-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z" /><circle cx="12" cy="10" r="2.25" /></svg></span>
              </button>
              <PlanetSwitch planet={planet} onSelect={selectPlanet} className="preview-switch-mobile" disabled={transitioning} />
              <div id="preview-list-content" inert={listCollapsed} aria-hidden={listCollapsed}>
              <div className="comparison-list-tabs" role="group" aria-label="Location list view">{[['browse', 'Locations'], ['matches', 'Matches'], ['discovery', 'Discovery'], ['checks', 'Checks']].map(([value, label]) => <button key={value} type="button" aria-pressed={listView === value} onClick={() => setListView(value)}>{label}</button>)}</div>
              {listView === 'checks' ? <ResearchTools report={benchmarkReport} families={families} sites={sites} /> : listView !== 'browse' ? <>
                <div className="comparison-list-context"><p>{target ? <>Target: <strong>{target.name}</strong></> : 'Choose a target in Compare.'}</p>{target && <p className="comparison-muted">{sampleData ? 'Example ranking · sample data' : 'Weighted resemblance'}{listView === 'discovery' ? ' · partial, unreviewed' : ''}</p>}</div>
                {target && <div className="comparison-result-tools"><label>Coverage <select aria-label="Minimum data coverage" value={minCoverage} onChange={(event) => setMinCoverage(Number(event.target.value))}><option value="0">Any</option><option value="50">50%+</option><option value="75">75%+</option><option value="100">100%</option></select></label>{candidatePlanet === 'earth' && listView === 'matches' && <label><input type="checkbox" checked={benchmarkOnly} onChange={(event) => setBenchmarkOnly(event.target.checked)} /> Benchmarks</label>}<button type="button" onClick={exportResults} disabled={!visibleResults.length}>Export CSV</button></div>}
                {listView === 'discovery' && target?.planet !== 'mars' ? <p className="comparison-empty">Choose a Mars target for discovery.</p> : visibleResults.length ? <ol className="preview-site-list">{visibleResults.map((result, index) => <li key={result.site.id}><button type="button" className="preview-site-button comparison-result" aria-pressed={selectedId === result.site.id} onClick={() => selectResult(result.site.id)} disabled={transitioning}><span className="preview-site-number">{String(index + 1).padStart(2, '0')}</span><span className="preview-site-name">{result.site.name}<small>{result.site.benchmark ? 'Benchmark · ' : ''}{Math.round(result.coverage)}% data coverage</small></span><span className="comparison-result-score">{result.score === null ? '—' : `${result.score.toFixed(1)}%`}</span></button></li>)}</ol> : <p className="comparison-empty">{!target ? 'Select a target to see ranked analogs.' : listView === 'discovery' && !discovery.length ? 'Global scan not connected. Discovery candidates will appear here.' : 'No sites match these filters.'}</p>}
              </> : planetSites.length ? (
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
                  <button className="comparison-primary-action" type="button" disabled={transitioning || selected.discovery} onClick={() => beginComparison(selected.id)}>{selected.planet === 'mars' ? 'Find Earth analogs' : 'Find Mars analogs'}</button>
                  <ComparisonDetails key={selected.id} site={selected} target={selectedResult ? target : null} result={selectedResult} isPlaceholder={selected.placeholder || Boolean(selectedResult?.placeholder)} earthData={earthData} earthSources={earthSources} />
                </div>
              </div>
            </aside>}
          </>
        )}
      </div>
      {mobileComparison && <MobileComparisonPage key={mode} settings={{ mode, targetId: target?.id || '', weights, presetId, elevationLimit }} sites={sites} placeholder={sampleData} disabled={transitioning || loading || Boolean(error)} onBack={closeMobileComparison} onDone={applyMobileComparison} />}
    </div>
  )
}
