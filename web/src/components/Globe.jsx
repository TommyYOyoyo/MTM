import { Component, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import GlobeView from 'react-globe.gl'
import { CircleGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry } from 'three'
import { markerAppearance } from '../lib/markerAppearance.js'

const CAMERA_ALTITUDE = 1.8
// Leave enough surrounding terrain visible when focusing a location.
const SELECTED_ALTITUDE = 0.34
const MIN_ALTITUDE = 0.04
const EMPTY_IDS = Object.freeze([])
const GLOBE_RADIUS = 100
const COLORS = {
  earth: '215, 41, 41',
  mars: '215, 41, 41',
  benchmark: '215, 41, 41',
  highlight: '241, 59, 53',
  selected: '255, 84, 75',
}

const withOpacity = (rgb, opacity) => `rgba(${rgb}, ${opacity})`

// Sample the sphere uniformly rather than favoring its poles.
function randomView() {
  return { lat: Math.asin(2 * Math.random() - 1) * 180 / Math.PI, lon: Math.random() * 360 - 180 }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character])
}

function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (!context) return false
    context.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

class GlobeErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    this.props.onFailure?.()
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** Planet visualization. The parent owns target selection and planet changes. */
const Globe = forwardRef(function Globe({ sites = [], planet = 'mars', selectedId = null, highlightIds = EMPTY_IDS, onSelect, onSpace, showSiteList = true, fill = false, initialAltitude }, ref) {
  const globe = useRef(null)
  const previousAltitude = useRef(null)
  const globeReady = useRef(false)
  const [container, setContainer] = useState(null)
  const [size, setSize] = useState({ width: 320, height: 400 })
  const [webglAvailable] = useState(supportsWebGL)
  const [ready, setReady] = useState(false)
  const [canvasFailed, setCanvasFailed] = useState(false)
  const [tileLevels, setTileLevels] = useState(null)
  const [markerOpacity, setMarkerOpacity] = useState(1)
  const [outlineOpacity, setOutlineOpacity] = useState(0)
  const currentPlanet = planet === 'earth' ? 'earth' : 'mars'
  const selectedIds = useMemo(() => new Set(highlightIds ?? []), [highlightIds])
  const points = useMemo(() => (Array.isArray(sites) ? sites : []).filter((site) =>
    site?.planet === currentPlanet && Number.isFinite(site.lat) && Number.isFinite(site.lon)
    && site.lat >= -90 && site.lat <= 90 && site.lon >= -180 && site.lon <= 180
  ), [sites, currentPlanet])
  const selected = points.find((site) => site.id === selectedId)
  const cameraTarget = useRef(null)
  const textureUrl = `${import.meta.env.BASE_URL}textures/${currentPlanet}.jpg`
  const tileRoot = `${import.meta.env.BASE_URL}textures/tiles`
  const detailTileRoot = import.meta.env.VITE_GLOBE_DETAIL_TILE_BASE_URL
  const tileLevel = tileLevels?.[currentPlanet]
  const tileUrl = useCallback((x, y, level) => `${level === 6 && detailTileRoot ? detailTileRoot : tileRoot}/${currentPlanet}/${level}/${x}/${y}.jpg`, [tileRoot, detailTileRoot, currentPlanet])

  useImperativeHandle(ref, () => ({
    isReady() { return globeReady.current },
    randomizeView(duration = 700) {
      if (!globe.current) return null
      const point = randomView()
      cameraTarget.current = point
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      globe.current.pointOfView({ lat: point.lat, lng: point.lon, altitude: fill ? 0.9 : CAMERA_ALTITUDE }, reducedMotion ? 0 : duration)
      return point
    },
    focusSite(id) {
      const point = points.find((site) => site.id === id)
      if (!point || !globe.current) return false
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      globe.current.pointOfView({ lat: point.lat, lng: point.lon, altitude: SELECTED_ALTITUDE }, reducedMotion ? 0 : 1000)
      return true
    },
    getView() {
      if (!globe.current) return null
      const { lat, lng, altitude } = globe.current.pointOfView()
      const fov = globe.current.camera()?.fov
      const fraction = Number.isFinite(fov) && Number.isFinite(altitude) && altitude > 0
        ? 1 / (Math.sqrt((1 + altitude) ** 2 - 1) * Math.tan(fov * Math.PI / 360))
        : undefined
      return { lat, lon: lng, altitude, fraction }
    },
    setView(view) {
      if (!globe.current || !view) return false
      const fov = globe.current.camera()?.fov
      const ratio = view.fraction * Math.tan(fov * Math.PI / 360)
      const altitude = Number.isFinite(ratio) && ratio > 0
        ? Math.sqrt(1 + 1 / ratio ** 2) - 1
        : 0.9
      globe.current.pointOfView({
        ...(Number.isFinite(view.lat) ? { lat: view.lat } : {}),
        ...(Number.isFinite(view.lon) ? { lng: view.lon } : {}),
        altitude,
      }, 0)
      return true
    },
    zoomOut(duration = 700) {
      if (!globe.current) return false
      const point = globe.current.pointOfView()
      globe.current.pointOfView({ lat: Math.max(-85, Math.min(85, point.lat + 4)), lng: point.lng + 12, altitude: 3.4 }, duration)
      return true
    },
    zoomIn(duration = 700) {
      if (!globe.current) return false
      const point = cameraTarget.current
      globe.current.pointOfView({ ...(point ? { lat: point.lat, lng: point.lon } : {}), altitude: fill ? 0.9 : CAMERA_ALTITUDE }, duration)
      return true
    },
  }), [fill, points])

  useEffect(() => {
    const controller = new AbortController()
    // The manifest is published only after all tiles for a planet are built.
    fetch(`${tileRoot}/manifest.json`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then(async (manifest) => {
        const available = {}
        for (const name of ['earth', 'mars']) {
          const level = manifest?.planets?.[name]?.maxLevel
          if (!Number.isInteger(level) || level < 0 || level > 6) continue
          const root = await fetch(`${tileRoot}/${name}/0/0/0.jpg`, { method: 'HEAD', signal: controller.signal })
          if (root.ok && root.headers.get('content-type')?.startsWith('image/')) available[name] = level
        }
        if (!controller.signal.aborted) setTileLevels(available)
      })
      .catch(() => { if (!controller.signal.aborted) setTileLevels({}) }) // The single-image globe remains the fallback.
    return () => controller.abort()
  }, [tileRoot])

  useEffect(() => {
    if (selected) cameraTarget.current = selected
  }, [selected])

  useEffect(() => {
    if (!container) return undefined
    const measure = () => {
      const bounds = container.getBoundingClientRect()
      const width = Math.max(1, Math.floor(bounds.width))
      const height = fill ? Math.max(1, Math.floor(bounds.height)) : Math.max(200, Math.min(620, Math.round(width * 0.9)))
      setSize((previous) => previous.width === width && previous.height === height ? previous : { width, height })
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [container, fill])

  useEffect(() => {
    if (!ready || !globe.current) return
    const point = selected
    if (!point) return
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    globe.current.pointOfView({ lat: point.lat, lng: point.lon, altitude: SELECTED_ALTITUDE }, reducedMotion ? 0 : 1000)
  }, [ready, selected, points, currentPlanet, fill])

  const handleReady = useCallback(() => {
    setReady(true)
    globeReady.current = true
    previousAltitude.current = null
    // Keep the camera outside the surface while still allowing the marker's
    // close-up outline-only state to be reached.
    const controls = globe.current?.controls?.()
    if (controls) controls.minDistance = GLOBE_RADIUS * (1 + MIN_ALTITUDE)
    // A new globe is mounted on planet switches. Its initial camera setup can
    // happen after the selection effect, so position it again once ready.
    const point = cameraTarget.current || randomView()
    cameraTarget.current = point
    if (point && globe.current) {
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      globe.current.pointOfView({ lat: point.lat, lng: point.lon, altitude: initialAltitude ?? (fill ? 0.9 : CAMERA_ALTITUDE) }, initialAltitude != null || reducedMotion ? 0 : 1000)
    }
    const renderer = globe.current?.renderer?.()
    renderer?.domElement?.addEventListener('webglcontextlost', () => setCanvasFailed(true), { once: true })
  }, [fill, initialAltitude])

  const handleZoom = useCallback(({ altitude }) => {
    const appearance = markerAppearance(altitude)
    if (!appearance) return
    setMarkerOpacity(appearance.fill)
    setOutlineOpacity(appearance.outline)
    if (onSpace && previousAltitude.current !== null && altitude >= 3 && altitude > previousAltitude.current) onSpace()
    previousAltitude.current = altitude
  }, [onSpace])

  const outlineObjects = useMemo(() => points.map((site) => {
    const isSelected = site.id === selectedId
    const radiusDegrees = fill ? (isSelected ? 0.45 : 0.32) : (isSelected ? 1.6 : selectedIds.has(site.id) ? 1.3 : 1.1)
    const radius = radiusDegrees * Math.PI * GLOBE_RADIUS / 180
    const rgb = isSelected ? COLORS.selected : selectedIds.has(site.id) ? COLORS.highlight : COLORS[site.planet] || COLORS.mars
    const material = new MeshBasicMaterial({ color: `rgb(${rgb})`, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide })
    const mesh = new Mesh(new RingGeometry(radius * 0.96, radius, 48), material)
    // The invisible disk is only a hit target; it does not paint or write depth.
    const hitMaterial = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false, side: DoubleSide })
    const hitMesh = new Mesh(new CircleGeometry(radius, 48), hitMaterial)
    const group = new Group()
    group.add(mesh, hitMesh)
    group.visible = false
    return { ...site, outlineGroup: group, outlineMesh: mesh, outlineHit: hitMesh, outlineAltitude: 0.0001 }
  }), [points, selectedId, selectedIds, fill])

  useEffect(() => {
    outlineObjects.forEach(({ outlineGroup, outlineMesh }) => {
      outlineMesh.material.opacity = outlineOpacity
      outlineGroup.visible = outlineOpacity > 0
    })
  }, [outlineObjects, outlineOpacity])

  useEffect(() => () => {
    outlineObjects.forEach(({ outlineMesh, outlineHit }) => {
      outlineMesh.geometry.dispose()
      outlineMesh.material.dispose()
      outlineHit.geometry.dispose()
      outlineHit.material.dispose()
    })
  }, [outlineObjects])

  const outlineObject = useCallback((site) => site.outlineGroup, [])

  const color = useCallback((site) => {
    if (site.id === selectedId) return withOpacity(COLORS.selected, markerOpacity)
    if (selectedIds.has(site.id)) return withOpacity(COLORS.highlight, markerOpacity)
    if (site.planet === 'earth' && site.benchmark) return withOpacity(COLORS.benchmark, markerOpacity)
    return withOpacity(COLORS[site.planet] || COLORS.mars, markerOpacity)
  }, [selectedId, selectedIds, markerOpacity])

  const fallback = (
    <div className="flex min-h-80 items-center justify-center rounded-2xl border border-white/10 bg-[#17191c] p-6 text-center text-sm leading-6 text-white/75" role="status">
      The globe is unavailable. Use the location list.
    </div>
  )

  return (
    <section aria-label={`${currentPlanet === 'mars' ? 'Mars' : 'Earth'} site globe`} className={fill ? 'globe-fullscreen w-full min-w-0 h-full' : 'w-full min-w-0'}>
      <div ref={setContainer} className={fill ? 'globe-backdrop relative w-full h-full overflow-hidden bg-[#090b0e]' : 'globe-backdrop relative w-full overflow-hidden rounded-2xl bg-[#090b0e]'}>
        {webglAvailable && !canvasFailed ? (
          <GlobeErrorBoundary key={`${currentPlanet}-${tileLevel ?? 'image'}`} fallback={fallback} onFailure={() => setCanvasFailed(true)}>
            <div className="globe-transition">
            {tileLevels !== null && <GlobeView
              ref={globe}
              width={size.width}
              height={size.height}
              backgroundColor="rgba(0,0,0,0)"
              backgroundImageUrl={`${import.meta.env.BASE_URL}textures/stars.svg`}
              globeImageUrl={tileLevel == null ? textureUrl : null}
              globeTileEngineUrl={tileLevel == null ? null : tileUrl}
              globeTileEngineMaxLevel={tileLevel ?? 6}
              showAtmosphere={currentPlanet === 'earth'}
              atmosphereColor="#6eb7ec"
              atmosphereAltitude={0.12}
              pointsData={points}
              pointLat="lat"
              pointLng="lon"
              pointColor={color}
              pointAltitude={(site) => site.id === selectedId ? 0.035 : 0.012}
              pointRadius={(site) => fill ? (site.id === selectedId ? 0.45 : 0.32) : (site.id === selectedId ? 1.6 : selectedIds.has(site.id) ? 1.3 : 1.1)}
              pointResolution={12}
              pointsMerge={false}
              pointLabel={(site) => `<strong>${escapeHtml(site.name || site.id)}</strong>${site.benchmark ? '<br>Benchmark' : ''}`}
              onPointClick={(site) => onSelect?.(site.id)}
              objectsData={outlineObjects}
              objectLat="lat"
              objectLng="lon"
              objectAltitude="outlineAltitude"
              objectFacesSurface
              objectThreeObject={outlineObject}
              objectLabel={(site) => `<strong>${escapeHtml(site.name || site.id)}</strong>${site.benchmark ? '<br>Benchmark' : ''}`}
              onObjectClick={(site) => onSelect?.(site.id)}
              onZoom={handleZoom}
              onGlobeReady={handleReady}
            />}
            </div>
          </GlobeErrorBoundary>
        ) : fallback}
      </div>
      <div className={`${fill ? 'globe-legend-overlay' : 'mt-4'} flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium tracking-[0.01em] text-white/60`} aria-label="Globe legend">
        <span><span className="mr-1.5" style={{ color: withOpacity(COLORS.selected, markerOpacity) }} aria-hidden="true">●</span>Selected</span>
        {selectedIds.size > 0 && <span><span className="mr-1.5" style={{ color: withOpacity(COLORS.highlight, markerOpacity) }} aria-hidden="true">●</span>Highlighted</span>}
        {points.some((site) => site.planet === 'earth' && site.benchmark) && <span><span className="mr-1.5" style={{ color: withOpacity(COLORS.benchmark, markerOpacity) }} aria-hidden="true">●</span>Benchmark</span>}
      </div>
      {showSiteList && <details open={(!webglAvailable || canvasFailed) ? true : undefined} className="mt-4 text-sm text-white/75">
        <summary className="min-h-11 w-fit cursor-pointer rounded-md py-3 font-medium transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#efbf97]">Select a site from a list</summary>
        {points.length ? (
          <ul className="mt-2 flex max-h-40 flex-wrap gap-2 overflow-auto">
            {points.map((site) => (
              <li key={site.id}>
                <button type="button" onClick={() => onSelect?.(site.id)} aria-pressed={site.id === selectedId}
                  className="min-h-11 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-left text-white/75 transition-colors hover:border-white/30 hover:bg-white/[0.08] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#efbf97] aria-pressed:border-[#efbf97]/70 aria-pressed:bg-[#efbf97]/10 aria-pressed:text-white">
                  {site.name || site.id}
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-white/55">No sites with valid coordinates are available for this planet.</p>}
      </details>}
    </section>
  )
})

export default Globe
