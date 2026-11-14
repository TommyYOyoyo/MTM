import { Component, lazy, Suspense, useEffect, useRef, useState } from 'react'

const Globe = lazy(() => import('react-globe.gl'))
const escapeText = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])

class GlobeBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <div className="mtm-globe-fallback" role="status"><h3>3D view unavailable</h3><p>You can still choose a site from the list below. Try a browser with WebGL enabled.</p></div> : this.props.children }
}

export default function PlanetExplorer({ planet, sites, selectedId, onSelect }) {
  const host = useRef(null)
  const globe = useRef(null)
  const [size, setSize] = useState({ width: 0, height: 540 })
  const [ready, setReady] = useState(false)
  const [view, setView] = useState({ lat: 0, lng: 0, altitude: 2.3 })
  const selected = sites.find(site => site.id === selectedId)
  const selectedLat = selected?.lat
  const selectedLon = selected?.lon

  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      const width = entries[0].contentRect.width
      setSize({ width, height: Math.max(360, Math.min(640, width * 1.05)) })
    })
    observer.observe(host.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!ready || !globe.current) return
    globe.current.pointOfView({ lat: Number.isFinite(selectedLat) ? selectedLat : 15, lng: Number.isFinite(selectedLon) ? selectedLon : 0, altitude: 2.3 }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 900)
  }, [ready, selectedLat, selectedLon, planet])

  function moveCamera(change) {
    if (!globe.current) return
    const current = globe.current.pointOfView()
    globe.current.pointOfView({ ...current, ...change(current) }, 250)
  }

  function initialize() {
    const controls = globe.current.controls()
    controls.enablePan = false
    controls.enableDamping = true
    controls.minDistance = 108
    controls.maxDistance = 700
    globe.current.pointOfView({ lat: Number.isFinite(selectedLat) ? selectedLat : 15, lng: Number.isFinite(selectedLon) ? selectedLon : 0, altitude: 2.3 })
    setReady(true)
  }

  const points = sites.filter(site => Number.isFinite(site.lat) && Number.isFinite(site.lon))
  return <div className="mtm-planet-view">
    <div className="mtm-globe-heading"><div><p className="mtm-eyebrow">02 / Explore the surface</p><h2>{planet === 'mars' ? 'Mars' : 'Earth'}</h2></div><span className="mtm-live-label">Interactive 3D</span></div>
    <p className="mtm-note">Drag to orbit · scroll or pinch to zoom · select a marker</p>
    <div className="mtm-camera-bar"><span data-testid="camera-position">{view.lat.toFixed(1)}° / {view.lng.toFixed(1)}°</span><div><button className="mtm-button" aria-label="Zoom in" onClick={() => moveCamera(current => ({ altitude: Math.max(.08, current.altitude * .65) }))}>+</button><button className="mtm-button" aria-label="Zoom out" onClick={() => moveCamera(current => ({ altitude: Math.min(5, current.altitude * 1.25) }))}>−</button><button className="mtm-button" onClick={() => moveCamera(() => ({ lat: selectedLat ?? 15, lng: selectedLon ?? 0, altitude: 2.3 }))}>Reset view</button></div></div>
    <div className="mtm-globe-canvas" ref={host} style={{ minHeight: size.height }} tabIndex={0} role="region" aria-label={`${planet} interactive globe. Arrow keys rotate, plus and minus zoom.`} onKeyDown={event => {
      const actions = { ArrowLeft: current => ({ lng: current.lng - 15 }), ArrowRight: current => ({ lng: current.lng + 15 }), ArrowUp: current => ({ lat: Math.min(85, current.lat + 10) }), ArrowDown: current => ({ lat: Math.max(-85, current.lat - 10) }), '+': current => ({ altitude: Math.max(.08, current.altitude * .65) }), '=': current => ({ altitude: Math.max(.08, current.altitude * .65) }), '-': current => ({ altitude: Math.min(5, current.altitude * 1.25) }) }
      if (actions[event.key]) { event.preventDefault(); moveCamera(actions[event.key]) }
    }}>
      <GlobeBoundary><Suspense fallback={<p className="mtm-globe-fallback" role="status">Loading 3D planet…</p>}>
        {size.width > 0 && <Globe ref={globe} width={size.width} height={size.height} globeImageUrl={`/explorer-textures/${planet}.jpg`} backgroundColor="rgba(0,0,0,0)" atmosphereColor={planet === 'mars' ? '#c5682f' : '#96b8d8'} atmosphereAltitude={0.12} animateIn={false} onGlobeReady={initialize} onZoom={setView}
          pointsData={points} pointLat="lat" pointLng="lon" pointAltitude={0.012} pointRadius={site => site.id === selectedId ? 1.2 : .7} pointColor={site => site.id === selectedId ? '#fff1c9' : '#efa66b'} pointLabel={site => escapeText(site.name)} onPointClick={site => onSelect(site.id)}
          labelsData={points.filter(site => site.id === selectedId)} labelLat="lat" labelLng="lon" labelText={site => site.name.replace(/^FAKE\s*/, '')} labelSize={1.2} labelDotRadius={.4} labelColor={() => '#fff1c9'} labelAltitude={.025} onLabelClick={site => onSelect(site.id)} />}
      </Suspense></GlobeBoundary>
    </div>
    <p className="mtm-texture-credit">Visualization texture: <a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noopener noreferrer">Solar System Scope</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>. Color-enhanced; some gaps are illustrative. Not a measurement layer.</p>
  </div>
}
