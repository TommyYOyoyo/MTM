import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import GlobeView from 'react-globe.gl'

const CAMERA_ALTITUDE = 1.8
const COLORS = {
  earth: '#9fc2cf',
  mars: '#d69b80',
  benchmark: '#c0b3d2',
  highlight: '#92c7b9',
  selected: '#efbf97',
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
export default function Globe({ sites = [], planet = 'mars', selectedId = null, highlightIds = [], onSelect, showSiteList = true, fill = false }) {
  const globe = useRef(null)
  const [container, setContainer] = useState(null)
  const [size, setSize] = useState({ width: 320, height: 400 })
  const [webglAvailable] = useState(supportsWebGL)
  const [ready, setReady] = useState(false)
  const [canvasFailed, setCanvasFailed] = useState(false)
  const currentPlanet = planet === 'earth' ? 'earth' : 'mars'
  const selectedIds = useMemo(() => new Set(highlightIds ?? []), [highlightIds])
  const points = useMemo(() => (Array.isArray(sites) ? sites : []).filter((site) =>
    site?.planet === currentPlanet && Number.isFinite(site.lat) && Number.isFinite(site.lon)
    && site.lat >= -90 && site.lat <= 90 && site.lon >= -180 && site.lon <= 180
  ), [sites, currentPlanet])
  const selected = points.find((site) => site.id === selectedId)
  const cameraTarget = useRef(null)
  const textureUrl = `${import.meta.env.BASE_URL}textures/${currentPlanet}.jpg`

  useEffect(() => {
    const images = ['earth', 'mars'].map((name) => {
      const image = new Image()
      image.src = `${import.meta.env.BASE_URL}textures/${name}.jpg`
      return image
    })
    return () => images.forEach((image) => { image.src = '' })
  }, [])

  useEffect(() => {
    cameraTarget.current = selected || points[0] || null
  }, [selected, points])

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
    const point = selected || points[0]
    if (!point) return
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    globe.current.pointOfView({ lat: point.lat, lng: point.lon, altitude: fill ? 0.9 : CAMERA_ALTITUDE }, reducedMotion ? 0 : 1000)
  }, [ready, selected, points, currentPlanet, fill])

  const handleReady = useCallback(() => {
    setReady(true)
    // A new globe is mounted on planet switches. Its initial camera setup can
    // happen after the selection effect, so position it again once ready.
    const point = cameraTarget.current
    if (point && globe.current) {
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      globe.current.pointOfView({ lat: point.lat, lng: point.lon, altitude: fill ? 0.9 : CAMERA_ALTITUDE }, reducedMotion ? 0 : 1000)
    }
    const renderer = globe.current?.renderer?.()
    renderer?.domElement?.addEventListener('webglcontextlost', () => setCanvasFailed(true), { once: true })
  }, [fill])

  const color = useCallback((site) => {
    if (site.id === selectedId) return COLORS.selected
    if (selectedIds.has(site.id)) return COLORS.highlight
    if (site.planet === 'earth' && site.benchmark) return COLORS.benchmark
    return COLORS[site.planet] || COLORS.mars
  }, [selectedId, selectedIds])

  const fallback = (
    <div className="flex min-h-80 items-center justify-center rounded-2xl border border-white/10 bg-[#17191c] p-6 text-center text-sm leading-6 text-white/75" role="status">
      The globe is unavailable. Use the location list.
    </div>
  )

  return (
    <section aria-label={`${currentPlanet === 'mars' ? 'Mars' : 'Earth'} site globe`} className={fill ? 'globe-fullscreen w-full min-w-0 h-full' : 'w-full min-w-0'}>
      <div ref={setContainer} className={fill ? 'globe-backdrop relative w-full h-full overflow-hidden bg-[#090b0e]' : 'globe-backdrop relative w-full overflow-hidden rounded-2xl bg-[#090b0e]'}>
        {webglAvailable && !canvasFailed ? (
          <GlobeErrorBoundary key={currentPlanet} fallback={fallback} onFailure={() => setCanvasFailed(true)}>
            <div className="globe-transition">
            <GlobeView
              ref={globe}
              width={size.width}
              height={size.height}
              backgroundColor="rgba(0,0,0,0)"
              backgroundImageUrl={`${import.meta.env.BASE_URL}textures/stars.svg`}
              globeImageUrl={textureUrl}
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
              onGlobeReady={handleReady}
            />
            </div>
          </GlobeErrorBoundary>
        ) : fallback}
      </div>
      <div className={`${fill ? 'globe-legend-overlay' : 'mt-4'} flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium tracking-[0.01em] text-white/60`} aria-label="Globe legend">
        <span><span className="mr-1.5" style={{ color: COLORS.selected }} aria-hidden="true">●</span>Selected</span>
        {selectedIds.size > 0 && <span><span className="mr-1.5" style={{ color: COLORS.highlight }} aria-hidden="true">●</span>Highlighted</span>}
        {points.some((site) => site.planet === 'earth' && site.benchmark) && <span><span className="mr-1.5" style={{ color: COLORS.benchmark }} aria-hidden="true">●</span>Benchmark</span>}
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
}
