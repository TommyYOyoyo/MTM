import { useEffect, useRef, useState } from 'react'
import { BufferAttribute, BufferGeometry, Color, DirectionalLight, DoubleSide, HemisphereLight, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, WebGLRenderer } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { terrainAssetPath, terrainGrid, validateTerrain } from '../lib/terrainData.js'
import './site-terrain.css'

export default function SiteTerrain({ site }) {
  const hostRef = useRef(null)
  const sceneRef = useRef(null)
  const scaleRef = useRef(3)
  const [heightScale, setHeightScale] = useState(3)
  const [state, setState] = useState({ siteId: null, status: 'loading' })
  const siteId = site?.id
  const lat = site?.lat
  const lon = site?.lon
  const planet = site?.planet
  const radiusKm = site?.radius_km

  useEffect(() => {
    if (!siteId || !hostRef.current) return undefined
    const host = hostRef.current
    const controller = new AbortController()
    let disposeScene = () => {}
    let alive = true

    async function load() {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}${terrainAssetPath({ id: siteId })}`, { signal: controller.signal })
        if (!response.ok || !response.headers.get('content-type')?.includes('json')) throw new Error('Terrain data is not connected for this location.')
        const data = validateTerrain(await response.json(), { id: siteId, planet, lat, lon, radius_km: radiusKm })
        if (!alive) return
        const grid = terrainGrid(data)
        const geometry = new BufferGeometry()
        geometry.setAttribute('position', new BufferAttribute(grid.positions, 3))
        geometry.setIndex(grid.indices)
        geometry.computeVertexNormals()
        const low = new Color(planet === 'mars' ? '#724b3c' : '#53645c')
        const high = new Color(planet === 'mars' ? '#d9b49b' : '#c9d1bf')
        const colors = new Float32Array(data.width * data.height * 3)
        for (let index = 0; index < data.elevations.length; index += 1) {
          const ratio = data.elevations[index] === null ? 0 : (data.elevations[index] - grid.min) / Math.max(1, grid.max - grid.min)
          const color = low.clone().lerp(high, ratio)
          colors.set([color.r, color.g, color.b], index * 3)
        }
        geometry.setAttribute('color', new BufferAttribute(colors, 3))
        const material = new MeshStandardMaterial({ vertexColors: true, roughness: 1, side: DoubleSide })
        const mesh = new Mesh(geometry, material)
        const unit = 2 / Math.max(data.sizeXM, data.sizeYM)
        mesh.scale.set(unit, unit * scaleRef.current, unit)
        const scene = new Scene()
        scene.background = new Color('#101317')
        scene.add(mesh)
        scene.add(new HemisphereLight('#e2e8ef', '#3a2a22', 2.2))
        const sun = new DirectionalLight('#fff4e9', 3)
        sun.position.set(-3, 5, -2)
        scene.add(sun)
        const camera = new PerspectiveCamera(42, 1, .01, 100)
        let renderer
        try { renderer = new WebGLRenderer({ antialias: true }) } catch (problem) {
          geometry.dispose()
          material.dispose()
          throw problem
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
        const canvas = renderer.domElement
        canvas.tabIndex = 0
        canvas.setAttribute('role', 'img')
        canvas.setAttribute('aria-label', `3D elevation model of ${siteId}. Drag to rotate, scroll to zoom, arrow keys to pan.`)
        host.appendChild(canvas)
        const controls = new OrbitControls(camera, canvas)
        controls.minDistance = .35
        controls.maxDistance = 8
        controls.minPolarAngle = .04
        controls.maxPolarAngle = Math.PI / 2 - .02
        controls.listenToKeyEvents(canvas)
        const draw = () => renderer.render(scene, camera)
        const reset = () => {
          controls.target.set(0, 0, 0)
          camera.position.set(1.45, 1.65, 2.15)
          controls.update()
          draw()
        }
        const resize = () => {
          const { width, height } = host.getBoundingClientRect()
          if (!width || !height) return
          camera.aspect = width / height
          camera.updateProjectionMatrix()
          renderer.setSize(width, height, false)
          draw()
        }
        const onLost = (event) => {
          event.preventDefault()
          if (alive) setState({ siteId, status: 'error', message: '3D view unavailable. Location data is still available below.' })
        }
        canvas.addEventListener('webglcontextlost', onLost)
        controls.addEventListener('change', draw)
        const observer = new ResizeObserver(resize)
        observer.observe(host)
        sceneRef.current = {
          reset,
          setScale(value) { mesh.scale.y = unit * value; draw() },
          zoom(multiplier) { camera.position.sub(controls.target).multiplyScalar(multiplier).add(controls.target); controls.update(); draw() },
        }
        reset()
        resize()
        disposeScene = () => {
          observer.disconnect()
          canvas.removeEventListener('webglcontextlost', onLost)
          controls.dispose()
          geometry.dispose()
          material.dispose()
          renderer.dispose()
          renderer.forceContextLoss()
          canvas.remove()
          sceneRef.current = null
        }
        setState({ siteId, status: 'ready', data })
      } catch (problem) {
        if (alive && problem.name !== 'AbortError') setState({ siteId, status: 'error', message: problem.message.startsWith('Terrain data') ? problem.message : '3D terrain unavailable for this location.' })
      }
    }
    load()
    return () => { alive = false; controller.abort(); disposeScene() }
  }, [siteId, lat, lon, planet, radiusKm])

  const status = state.siteId === siteId ? state.status : 'loading'
  const data = status === 'ready' ? state.data : null
  return <div className="site-terrain">
    <div ref={hostRef} className="site-terrain-canvas" />
    {status !== 'ready' && <p className="site-terrain-message" role="status">{status === 'loading' ? 'Loading terrain…' : state.message}</p>}
    {data && <>
      <div className="site-terrain-tools">
        <label>Height <select aria-label="Terrain height exaggeration" value={heightScale} onChange={(event) => {
          const value = Number(event.target.value)
          scaleRef.current = value
          setHeightScale(value)
          sceneRef.current?.setScale(value)
        }}><option value="1">×1</option><option value="3">×3</option><option value="10">×10</option></select></label>
        <button type="button" aria-label="Zoom into terrain" onClick={() => sceneRef.current?.zoom(.8)}>+</button>
        <button type="button" aria-label="Zoom out of terrain" onClick={() => sceneRef.current?.zoom(1.25)}>−</button>
        <button type="button" aria-label="Reset terrain view" title="Reset terrain view" onClick={() => sceneRef.current?.reset()}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3" /></svg></button>
      </div>
      <div className="site-terrain-caption"><a href={data.source.url} target="_blank" rel="noreferrer">{data.source.name}</a><span>{Math.round(data.source.resolutionM)} m · {(data.sizeXM / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} km across</span></div>
    </>}
  </div>
}
