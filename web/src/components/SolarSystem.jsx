import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import {
  AmbientLight, BufferGeometry, Color, Float32BufferAttribute, HemisphereLight,
  LineBasicMaterial, LineLoop, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  PerspectiveCamera, PointLight, Points, PointsMaterial, RingGeometry, Scene,
  SphereGeometry, SRGBColorSpace, TextureLoader, Vector2, Vector3, WebGLRenderer,
  Raycaster, DoubleSide, CubicBezierCurve3,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { PLANETS, planetPositions, orbitPath } from '../lib/solarEphemeris.js'
import './solar-system.css'

const EMPTY_SITES = Object.freeze([])

// Use an illustrative distance scale so the inner and outer planets are both
// usable in one view. The underlying positions still come from the ephemeris.
function displayPosition(position) {
  const r = Math.hypot(position.x, position.y, position.z)
  if (!r) return new Vector3()
  const displayRadius = 3 + 7 * Math.pow(r, 0.56)
  return new Vector3(position.x, position.z, -position.y).multiplyScalar(displayRadius / r)
}

function ease(value) {
  return value < 0.5 ? 4 * value ** 3 : 1 - ((-2 * value + 2) ** 3) / 2
}

function surfaceDirection(coords) {
  if (!Number.isFinite(coords?.lat) || !Number.isFinite(coords?.lon)) return new Vector3(0, 0, 1)
  const lat = coords.lat * Math.PI / 180
  const lon = coords.lon * Math.PI / 180
  return new Vector3(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon))
}

function makeStars() {
  const coords = []
  let seed = 127733
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
  for (let i = 0; i < 1400; i += 1) {
    const z = random() * 2 - 1
    const angle = random() * Math.PI * 2
    const radius = 250 + random() * 60
    const ring = Math.sqrt(1 - z * z)
    coords.push(radius * ring * Math.cos(angle), radius * z, radius * ring * Math.sin(angle))
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(coords, 3))
  return new Points(geometry, new PointsMaterial({ color: 0xdde9ff, size: 0.3, sizeAttenuation: true }))
}

const SolarSystem = forwardRef(function SolarSystem({ planet = 'mars', sites = EMPTY_SITES, onReturn }, ref) {
  const containerRef = useRef(null)
  const engineRef = useRef(null)
  const propsRef = useRef({ planet, onReturn })
  const readyRef = useRef(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => { propsRef.current = { planet, onReturn } }, [planet, onReturn])

  if (!readyRef.current) {
    let resolve
    const promise = new Promise((done) => { resolve = done })
    readyRef.current = { promise, resolve }
  }

  useImperativeHandle(ref, () => ({
    ready: () => readyRef.current.promise,
    travel: async (from, to, options = {}) => {
      await readyRef.current.promise
      return engineRef.current?.travel(from, to, options) ?? { cancelled: true }
    },
    focusPlanet: async (id, options = {}) => {
      await readyRef.current.promise
      return engineRef.current?.focus(id, options) ?? { cancelled: true }
    },
    prepareTravel: async (id, coords) => {
      await readyRef.current.promise
      return engineRef.current?.prepareTravel(id, coords) ?? { cancelled: true }
    },
    expandToOverview: async (options = {}) => {
      await readyRef.current.promise
      return engineRef.current?.expandToOverview(options) ?? { cancelled: true }
    },
  }), [])

  useEffect(() => {
    const host = containerRef.current
    if (!host) return undefined
    let renderer
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    } catch {
      setFailed(true)
      readyRef.current.resolve()
      return undefined
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    renderer.setClearColor(0x090b0e, 1)
    renderer.outputColorSpace = SRGBColorSpace
    renderer.domElement.className = 'solar-canvas'
    host.appendChild(renderer.domElement)

    const labels = new CSS2DRenderer()
    labels.domElement.className = 'solar-label-layer'
    host.appendChild(labels.domElement)

    const scene = new Scene()
    scene.background = new Color(0x090b0e)
    const camera = new PerspectiveCamera(45, 1, 0.05, 500)
    const overviewPosition = new Vector3(0, 76, 110)
    camera.position.copy(overviewPosition)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.enablePan = true
    const minimumOrbitDistance = 0.15
    controls.minDistance = minimumOrbitDistance
    controls.maxDistance = 155
    controls.zoomToCursor = true
    controls.target.set(0, 0, 0)
    scene.add(makeStars())
    scene.add(new AmbientLight(0xffffff, 0.35))
    scene.add(new HemisphereLight(0xd8e8ff, 0x27202a, 0.7))
    scene.add(new PointLight(0xffffff, 2, 0, 0))
    const textureLoader = new TextureLoader()
    const textureMap = {}
    for (const name of ['sun', ...PLANETS.map((item) => item.id)]) {
      const path = name === 'earth' || name === 'mars' ? `${name}-solar.jpg` : `solar/${name}.jpg`
      textureMap[name] = textureLoader.load(`${import.meta.env.BASE_URL}textures/${path}`)
      textureMap[name].colorSpace = SRGBColorSpace
    }
    const sun = new Mesh(new SphereGeometry(1.55, 40, 28), new MeshBasicMaterial({ color: 0xffffff, map: textureMap.sun }))
    scene.add(sun)

    const meshes = new Map()
    const markers = []
    const planetTargets = []
    let engine
    function activate(id) {
      if (id === 'earth' || id === 'mars') {
        propsRef.current.onReturn?.(id)
      }
    }

    for (const spec of PLANETS) {
      const geometry = new SphereGeometry(spec.radius, 28, 20)
      const material = new MeshStandardMaterial({ color: textureMap[spec.id] ? 0xffffff : spec.color, map: textureMap[spec.id] || null, roughness: 0.95, metalness: 0 })
      const mesh = new Mesh(geometry, material)
      if (spec.id === 'earth' || spec.id === 'mars') mesh.rotation.y = -Math.PI / 2
      mesh.userData.planetId = spec.id
      if (spec.id === 'saturn') {
        const rings = new Mesh(new RingGeometry(spec.radius * 1.3, spec.radius * 2.2, 48), new MeshBasicMaterial({ color: 0xbda988, side: DoubleSide, transparent: true, opacity: 0.68, depthWrite: false }))
        rings.rotation.x = Math.PI / 2.35
        mesh.add(rings)
      }
      if (spec.id === 'earth' || spec.id === 'mars') {
        const targetButton = document.createElement('button')
        targetButton.type = 'button'
        targetButton.className = 'solar-planet-target'
        targetButton.setAttribute('aria-label', `Open ${spec.name}`)
        targetButton.addEventListener('pointerdown', (event) => event.stopPropagation())
        targetButton.addEventListener('click', (event) => { event.stopPropagation(); activate(spec.id) })
        const target = new CSS2DObject(targetButton)
        mesh.add(target)
        planetTargets.push({ targetButton, mesh, radius: spec.radius })
      }
      scene.add(mesh)
      meshes.set(spec.id, mesh)

      const curve = orbitPath(spec.id, new Date(), 180).map(displayPosition)
      const orbit = new LineLoop(new BufferGeometry().setFromPoints(curve), new LineBasicMaterial({ color: 0x9ba5b8, transparent: true, opacity: 0.25, depthWrite: false }))
      scene.add(orbit)
    }

    let raf = 0
    let lastSample = -Infinity
    let positionsById = new Map()
    let movement = null
    const raycaster = new Raycaster()
    const pointer = new Vector2()
    let down = null
    const touches = new Map()
    let pinchDistance = null
    let pinchAnchorDistance = null
    let pinchAnchorCenter = null
    const pinchMovedPointers = new Set()
    let pinchMoveCount = 0
    let wasPinching = false
    let zoomIntent = null
    let enteringPlanet = false

    // Earth and Mars are small at solar-system scale. Make their selection
    // targets usable without diverting wheel or pinch input from the canvas.
    function planetAt(clientX, clientY, extraPadding = 0) {
      const bounds = renderer.domElement.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return null
      pointer.set((clientX - bounds.left) / bounds.width * 2 - 1, -(clientY - bounds.top) / bounds.height * 2 + 1)
      camera.updateMatrixWorld()
      scene.updateMatrixWorld()
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects([sun, ...meshes.values()], false)[0]
      if (hit && ['earth', 'mars'].includes(hit.object.userData.planetId)) return hit.object.userData.planetId

      // Include the projected disc as well as a small margin for touch and
      // trackpads. Do not select a planet hidden behind a nearer body.
      let closest = null
      let bestDistance = Infinity
      for (const id of ['earth', 'mars']) {
        const mesh = meshes.get(id)
        const projected = mesh.position.clone().project(camera)
        if (projected.z < -1 || projected.z > 1) continue
        const toPlanet = mesh.position.clone().sub(camera.position)
        const distanceToPlanet = toPlanet.length()
        if (hit && hit.distance < distanceToPlanet - mesh.geometry.parameters.radius) continue
        const x = bounds.left + (projected.x + 1) * bounds.width / 2
        const y = bounds.top + (1 - projected.y) * bounds.height / 2
        const radius = mesh.geometry.parameters.radius
        const projectedRadius = distanceToPlanet > radius
          ? radius / Math.sqrt(distanceToPlanet ** 2 - radius ** 2) * bounds.height / (2 * Math.tan(camera.fov * Math.PI / 360))
          : Math.max(bounds.width, bounds.height)
        const distance = Math.hypot(clientX - x, clientY - y) / (projectedRadius + 24 + extraPadding)
        if (distance < 1 && distance < bestDistance) { closest = id; bestDistance = distance }
      }
      return closest
    }

    function trackInwardZoom(x, y, padding = 0) {
      if (movement || enteringPlanet || !controls.enabled) return
      const id = planetAt(x, y, padding)
      zoomIntent = id ? { id, expires: performance.now() + 400 } : null
      controls.minDistance = minimumOrbitDistance
      if (id) {
        // OrbitControls limits cursor zoom relative to its old target, which
        // may be much closer than the planet. Extend the target along the
        // existing viewing direction; this preserves the camera's framing and
        // lets the same gesture reach a planet on either side of the Sun.
        const mesh = meshes.get(id)
        const forward = camera.getWorldDirection(new Vector3())
        const distance = camera.position.distanceTo(mesh.position) + mesh.geometry.parameters.radius * 2
        controls.target.copy(camera.position).addScaledVector(forward, Math.max(distance, controls.minDistance + 0.1))
        // Stop the next wheel/pinch update at the arrival shell. A large
        // gesture can otherwise move through a planet between animation
        // frames before React has a chance to open its detailed view.
        const radius = mesh.geometry.parameters.radius
        const ratio = 0.82 * Math.tan(camera.fov * Math.PI / 360)
        const arrivalRadius = radius * Math.sqrt(1 + 1 / (ratio * ratio)) * 0.99
        const toPlanet = mesh.position.clone().sub(camera.position)
        const along = toPlanet.dot(raycaster.ray.direction)
        const perpendicularSquared = Math.max(0, toPlanet.lengthSq() - along * along)
        if (along > 0 && perpendicularSquared < arrivalRadius * arrivalRadius) {
          const distanceToArrival = Math.max(0, along - Math.sqrt(arrivalRadius * arrivalRadius - perpendicularSquared))
          controls.minDistance = Math.max(minimumOrbitDistance, distance - distanceToArrival)
        }
      }
    }

    function checkZoomIntent() {
      if (!zoomIntent || movement || enteringPlanet) return
      const { id, expires } = zoomIntent
      if (performance.now() > expires) {
        zoomIntent = null
        controls.minDistance = minimumOrbitDistance
        return
      }
      const mesh = meshes.get(id)
      const distance = camera.position.distanceTo(mesh.position)
      const radius = mesh.geometry.parameters.radius
      const fraction = distance > radius ? radius / Math.sqrt(distance * distance - radius * radius) / Math.tan(camera.fov * Math.PI / 360) : Infinity
      // Only an intentional inward gesture can arm this handoff; outward
      // zoom and merely orbiting around a planet never trigger it.
      if (fraction >= 0.82) {
        enteringPlanet = true
        zoomIntent = null
        controls.enabled = false
        const direction = camera.position.clone().sub(mesh.position).normalize()
        const lat = Math.asin(Math.max(-1, Math.min(1, direction.y))) * 180 / Math.PI
        const lon = Math.atan2(direction.x, direction.z) * 180 / Math.PI
        propsRef.current.onReturn?.(id, { fromZoom: true, view: { lat, lon, fraction } })
      }
    }
    controls.addEventListener('change', checkZoomIntent)

    function sample(time) {
      positionsById = new Map(planetPositions(new Date()).map((entry) => [entry.id, displayPosition(entry)]))
      for (const [id, mesh] of meshes) {
        const position = positionsById.get(id)
        if (position) mesh.position.copy(position)
      }
      lastSample = time
    }

    function startMovement(fromPosition, fromTarget, toPosition, toTarget, duration) {
      if (movement) {
        movement.resolve({ cancelled: true })
        movement = null
      }
      if (!duration || duration <= 0) {
        camera.position.copy(toPosition)
        controls.target.copy(toTarget)
        controls.update()
        return Promise.resolve({ cancelled: false })
      }
      return new Promise((resolve) => {
        movement = { start: performance.now(), duration, fromPosition, fromTarget, toPosition, toTarget, resolve }
      })
    }

    engine = {
      expandToOverview({ duration = 1800 } = {}) {
        return startMovement(camera.position.clone(), controls.target.clone(), overviewPosition.clone(), new Vector3(), duration)
      },
      prepareTravel(id, coords) {
        sample(performance.now())
        const target = positionsById.get(id)
        const spec = PLANETS.find((item) => item.id === id)
        if (!target || !spec) return Promise.resolve({ cancelled: true })
        const fraction = Number.isFinite(coords?.fraction) ? Math.max(0.05, Math.min(3, coords.fraction)) : 0.55
        const ratio = fraction * Math.tan(camera.fov * Math.PI / 360)
        const distance = spec.radius * Math.sqrt(1 + 1 / (ratio * ratio))
        return startMovement(camera.position.clone(), controls.target.clone(), target.clone().add(surfaceDirection(coords).multiplyScalar(distance)), target.clone(), 0)
      },
      travel(fromId, toId, { duration = 2600, targetCoordinates, targetFraction = 0.55, onProgress } = {}) {
        sample(performance.now())
        const to = positionsById.get(toId) || new Vector3()
        // The camera may already be exploring the solar view; preserve it.
        const startPosition = camera.position.clone()
        const startTarget = controls.target.clone()
        const spec = PLANETS.find((item) => item.id === toId)
        if (!spec) return Promise.resolve({ cancelled: true })
        const ratio = Math.max(0.05, targetFraction) * Math.tan(camera.fov * Math.PI / 360)
        const distance = spec.radius * Math.sqrt(1 + 1 / (ratio * ratio))
        const endPosition = to.clone().add(surfaceDirection(targetCoordinates).multiplyScalar(distance))
        if (!duration || duration <= 0) {
          onProgress?.(1)
          return startMovement(startPosition, startTarget, endPosition, to.clone(), 0)
        }
        if (movement) movement.resolve({ cancelled: true })
        return new Promise((resolve) => {
          let curve
          let targetCurve
          if (fromId !== toId) {
            // Pass beside the inner planets at a shallow angle. Matching
            // tangents keep the camera and its focus moving continuously
            // through the midpoint instead of stopping for a wide overview.
            const from = positionsById.get(fromId) || startTarget
            const midpoint = from.clone().add(to).multiplyScalar(0.5)
            const focus = midpoint.clone().multiplyScalar(0.86)
            const across = to.clone().sub(from).setY(0)
            if (across.lengthSq() < 1e-6) across.set(1, 0, 0)
            across.normalize()
            const distance = Math.max(24, Math.min(42, from.distanceTo(to) * 1.8))
            const flyThrough = across.clone().multiplyScalar(distance * 0.22)
            const outward = Math.min(8, distance * 0.22)
            const departure = startPosition.clone().add(startPosition.clone().sub(startTarget).normalize().multiplyScalar(outward))
            const arrival = endPosition.clone().add(endPosition.clone().sub(to).normalize().multiplyScalar(outward))
            const focusTangent = to.clone().sub(startTarget).multiplyScalar(0.12)
            const firstFocus = new CubicBezierCurve3(startTarget, startTarget.clone(), focus.clone().sub(focusTangent), focus)
            const secondFocus = new CubicBezierCurve3(focus, focus.clone().add(focusTangent), to.clone(), to.clone())
            targetCurve = { getPoint(t, out) { return t < 0.5 ? firstFocus.getPoint(t * 2, out) : secondFocus.getPoint((t - 0.5) * 2, out) } }
            const radial = midpoint.clone().setY(0)
            if (radial.lengthSq() < 1e-6) radial.copy(startPosition).sub(startTarget).setY(0)
            if (radial.lengthSq() < 1e-6) radial.set(0, 0, 1)
            radial.normalize()
            let bestClearance = -Infinity
            for (const angle of [0, Math.PI / 6, -Math.PI / 6, Math.PI / 3, -Math.PI / 3]) {
              const direction = radial.clone().applyAxisAngle(new Vector3(0, 1, 0), angle)
              const viewpoint = focus.clone().addScaledVector(direction, distance * Math.cos(Math.PI / 9))
              viewpoint.y += distance * Math.sin(Math.PI / 9)
              const first = new CubicBezierCurve3(startPosition, departure, viewpoint.clone().sub(flyThrough), viewpoint)
              const second = new CubicBezierCurve3(viewpoint, viewpoint.clone().add(flyThrough), arrival, endPosition)
              const candidate = { getPoint(t, out) { return t < 0.5 ? first.getPoint(t * 2, out) : second.getPoint((t - 0.5) * 2, out) } }
              let clearance = Infinity
              for (let step = 3; step < 38; step += 1) {
                const t = step / 40
                const eye = candidate.getPoint(t, new Vector3())
                const look = targetCurve.getPoint(t, new Vector3())
                const sight = look.clone().sub(eye)
                const lengthSquared = sight.lengthSq()
                for (const planet of PLANETS) {
                  if (planet.id === fromId || planet.id === toId) continue
                  const point = positionsById.get(planet.id)
                  if (!point || !lengthSquared) continue
                  const along = point.clone().sub(eye).dot(sight) / lengthSquared
                  if (along <= 0 || along > 1.5) continue
                  const separation = point.distanceTo(eye.clone().addScaledVector(sight, along))
                  clearance = Math.min(clearance, separation / (planet.radius + 0.6))
                }
              }
              if (clearance > bestClearance) { curve = candidate; bestClearance = clearance }
              if (bestClearance >= 2) break
            }
          }
          movement = { start: performance.now(), duration, fromPosition: startPosition, fromTarget: startTarget, toPosition: endPosition, toTarget: to.clone(), curve, targetCurve, onProgress, resolve }
        })
      },
      focus(id, { duration = 1000 } = {}) {
        const target = positionsById.get(id)
        if (!target) return Promise.resolve({ cancelled: true })
        const end = target.clone().add(new Vector3(0, 2.8, 5))
        return startMovement(camera.position.clone(), controls.target.clone(), end, target.clone(), duration)
      },
      setSites(nextSites) {
        markers.splice(0).forEach(({ label }) => { label.removeFromParent(); label.element.remove() })
        for (const site of Array.isArray(nextSites) ? nextSites : []) {
          const mesh = meshes.get(site?.planet)
          if (!mesh || !['earth', 'mars'].includes(site.planet) || !Number.isFinite(site.lat) || !Number.isFinite(site.lon) || Math.abs(site.lat) > 90 || Math.abs(site.lon) > 180) continue
          const spec = PLANETS.find((item) => item.id === site.planet)
          const lat = site.lat * Math.PI / 180
          const lon = site.lon * Math.PI / 180
          const normal = new Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon))
          const dot = document.createElement('span')
          dot.className = 'solar-site-marker'
          dot.setAttribute('aria-hidden', 'true')
          const label = new CSS2DObject(dot)
          label.position.copy(normal).multiplyScalar(spec.radius * 1.04)
          mesh.add(label)
          markers.push({ label, mesh, normal })
        }
      },
    }
    engineRef.current = engine

    function handlePointerDown(event) {
      down = { x: event.clientX, y: event.clientY }
      if (event.pointerType === 'touch') {
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
        if (touches.size === 2) {
          wasPinching = true
          const [a, b] = [...touches.values()]
          pinchDistance = Math.hypot(a.x - b.x, a.y - b.y)
          pinchAnchorDistance = pinchDistance
          pinchAnchorCenter = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
          pinchMovedPointers.clear()
          pinchMoveCount = 0
        }
      }
    }
    function handlePointerMove(event) {
      if (event.pointerType !== 'touch' || !touches.has(event.pointerId)) return
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (touches.size !== 2) return
      const [a, b] = [...touches.values()]
      const nextDistance = Math.hypot(a.x - b.x, a.y - b.y)
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const separationChange = pinchAnchorDistance === null ? 0 : Math.abs(nextDistance - pinchAnchorDistance)
      const centerChange = pinchAnchorCenter ? Math.hypot(center.x - pinchAnchorCenter.x, center.y - pinchAnchorCenter.y) : 0
      // Keep OrbitControls' pan bookkeeping active, but suppress midpoint
      // jitter while the fingers are clearly changing separation. Two-finger
      // translation with nearly constant separation still pans normally. Wait
      // for both pointers where possible: touch events arrive individually.
      pinchMovedPointers.add(event.pointerId)
      pinchMoveCount += 1
      if (pinchMovedPointers.size === 2 || pinchMoveCount >= 3) {
        controls.panSpeed = separationChange > Math.max(1.5, nextDistance * 0.01) && separationChange > centerChange * 1.3 ? 0 : 1
        pinchAnchorDistance = nextDistance
        pinchAnchorCenter = center
        pinchMovedPointers.clear()
        pinchMoveCount = 0
      }
      if (pinchDistance !== null && nextDistance > pinchDistance + 0.25) trackInwardZoom(center.x, center.y, Math.min(36, nextDistance * 0.25))
      else if (pinchDistance !== null && nextDistance < pinchDistance - 0.25) { zoomIntent = null; controls.minDistance = minimumOrbitDistance }
      pinchDistance = nextDistance
    }
    function handlePointerUp(event) {
      if (event.pointerType === 'touch') {
        touches.delete(event.pointerId)
        pinchDistance = null
        pinchAnchorDistance = null
        pinchAnchorCenter = null
        pinchMovedPointers.clear()
        pinchMoveCount = 0
        controls.panSpeed = 1
        if (wasPinching) { if (!touches.size) wasPinching = false; down = null; return }
      }
      if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6 || movement) { down = null; return }
      down = null
      const id = planetAt(event.clientX, event.clientY)
      if (id) activate(id)
    }
    function handleWheel(event) {
      if (event.deltaY < 0) trackInwardZoom(event.clientX, event.clientY)
      else { zoomIntent = null; controls.minDistance = minimumOrbitDistance }
    }
    function handlePointerCancel(event) {
      touches.delete(event.pointerId)
      pinchDistance = null
      pinchAnchorDistance = null
      pinchAnchorCenter = null
      pinchMovedPointers.clear()
      pinchMoveCount = 0
      controls.panSpeed = 1
      if (!touches.size) wasPinching = false
      down = null
      zoomIntent = null
      controls.minDistance = minimumOrbitDistance
    }
    renderer.domElement.addEventListener('pointerdown', handlePointerDown)
    renderer.domElement.addEventListener('pointermove', handlePointerMove)
    renderer.domElement.addEventListener('pointerup', handlePointerUp)
    renderer.domElement.addEventListener('pointercancel', handlePointerCancel)
    renderer.domElement.addEventListener('wheel', handleWheel, { passive: true, capture: true })

    function resize() {
      const { width, height } = host.getBoundingClientRect()
      if (!width || !height) return
      camera.aspect = width / height
      // Preserve the overview's horizontal field of view on narrow screens.
      camera.fov = camera.aspect < 1
        ? Math.min(100, 2 * Math.atan(Math.tan(Math.PI / 8) / camera.aspect) * 180 / Math.PI)
        : 45
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
      labels.setSize(width, height)
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
    if (observer) observer.observe(host)
    else window.addEventListener('resize', resize)
    resize()
    sample(performance.now())
    readyRef.current.resolve()

    function render(time) {
      if (time - lastSample >= 1000) sample(time)
      if (movement) {
        const progress = Math.min(1, (time - movement.start) / movement.duration)
        movement.onProgress?.(progress)
        if (movement.curve) {
          const amount = ease(progress)
          movement.curve.getPoint(amount, camera.position)
          if (movement.targetCurve) movement.targetCurve.getPoint(amount, controls.target)
          else controls.target.lerpVectors(movement.fromTarget, movement.toTarget, amount)
        } else {
          const amount = ease(progress)
          camera.position.lerpVectors(movement.fromPosition, movement.toPosition, amount)
          controls.target.lerpVectors(movement.fromTarget, movement.toTarget, amount)
        }
        if (progress >= 1) { const finished = movement; movement = null; finished.resolve({ cancelled: false }) }
      }
      controls.enabled = !movement && !enteringPlanet
      controls.update()
      checkZoomIntent()
      for (const { label, mesh, normal } of markers) {
        const toCamera = camera.position.clone().sub(mesh.position)
        const projectedRadius = mesh.geometry.parameters.radius / toCamera.length() * host.clientHeight / (2 * Math.tan(camera.fov * Math.PI / 360))
        label.element.style.visibility = projectedRadius > 30 && normal.clone().applyQuaternion(mesh.quaternion).dot(toCamera) > 0 ? 'visible' : 'hidden'
      }
      for (const { targetButton, mesh, radius } of planetTargets) {
        const distance = camera.position.distanceTo(mesh.position)
        const projectedRadius = radius / distance * host.clientHeight / (2 * Math.tan(camera.fov * Math.PI / 360))
        targetButton.classList.toggle('is-close', projectedRadius > 35 || !!movement)
        targetButton.style.setProperty('--target-size', `${Math.max(28, Math.min(74, projectedRadius * 2 + 10))}px`)
      }
      renderer.render(scene, camera)
      labels.render(scene, camera)
      raf = requestAnimationFrame(render)
    }
    raf = requestAnimationFrame(render)
    return () => {
      if (movement) movement.resolve({ cancelled: true })
      engineRef.current = null
      cancelAnimationFrame(raf)
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
      renderer.domElement.removeEventListener('pointermove', handlePointerMove)
      renderer.domElement.removeEventListener('pointerup', handlePointerUp)
      renderer.domElement.removeEventListener('pointercancel', handlePointerCancel)
      renderer.domElement.removeEventListener('wheel', handleWheel, { capture: true })
      observer?.disconnect()
      if (!observer) window.removeEventListener('resize', resize)
      controls.removeEventListener('change', checkZoomIntent)
      controls.dispose()
      scene.traverse((object) => {
        object.geometry?.dispose()
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose())
        else object.material?.dispose()
      })
      Object.values(textureMap).forEach((texture) => texture.dispose())
      renderer.dispose()
      renderer.domElement.remove()
      labels.domElement.remove()
    }
  }, [])

  useEffect(() => { engineRef.current?.setSites(sites) }, [sites])

  return (
    <section ref={containerRef} className="solar-system" aria-label="Solar system">
      {failed && <p className="solar-error" role="status">Solar system view unavailable.</p>}
    </section>
  )
})

export default SolarSystem
