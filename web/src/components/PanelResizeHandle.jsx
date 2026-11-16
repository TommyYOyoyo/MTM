import { useEffect, useRef } from 'react'

const REM = () => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16

function readStored(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null }
}

function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* no storage, size just won't be saved */ }
}

// corner grip to resize a panel --> writes the size into css variables (list + search bar move together)
// bottom-left = details panel (width + height), top-right = list panel (width only, height is the drawer)
// arrow keys = 16px (shift = 64px), double click = reset
export default function PanelResizeHandle({ widthVar, heightVar = null, storageKey, corner = 'bottom-left', minWidthRem = 16, maxWidthVw = 0.6, minHeightRem = 12, label }) {
  const start = useRef(null)
  const xSign = corner.endsWith('left') ? -1 : 1
  const ySign = corner.startsWith('bottom') ? 1 : -1

  const clampWidth = (width) => Math.max(minWidthRem * REM(), Math.min(window.innerWidth * maxWidthVw, width))
  const clampHeight = (height, top) => Math.max(minHeightRem * REM(), Math.min(window.innerHeight - top - REM(), height))

  function apply(size, panel) {
    const next = {}
    if (Number.isFinite(size.width)) {
      next.width = Math.round(clampWidth(size.width))
      document.documentElement.style.setProperty(widthVar, `${next.width}px`)
    }
    if (heightVar && Number.isFinite(size.height)) {
      const top = panel?.getBoundingClientRect().top ?? 6 * REM()
      next.height = Math.round(clampHeight(size.height, top))
      document.documentElement.style.setProperty(heightVar, `${next.height}px`)
    }
    return next
  }

  const panelOf = (target) => target.closest('aside, [data-resizable]')

  useEffect(() => {
    const restore = () => { const saved = readStored(storageKey); if (saved) apply(saved, null) }
    restore()
    window.addEventListener('resize', restore)
    return () => window.removeEventListener('resize', restore)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widthVar, heightVar, storageKey])

  function onPointerDown(event) {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const panel = panelOf(event.currentTarget)
    const rect = panel.getBoundingClientRect()
    start.current = { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height, panel }
    document.documentElement.classList.add('is-panel-resizing')
  }
  function sizeFrom(event) {
    const { x, y, width, height } = start.current
    return { width: width + xSign * (event.clientX - x), height: heightVar ? height + ySign * (event.clientY - y) : undefined }
  }
  function onPointerMove(event) {
    if (start.current) apply(sizeFrom(event), start.current.panel)
  }
  function onPointerUp(event) {
    if (!start.current) return
    store(storageKey, apply(sizeFrom(event), start.current.panel))
    start.current = null
    document.documentElement.classList.remove('is-panel-resizing')
  }
  function onKeyDown(event) {
    const step = event.shiftKey ? 64 : 16
    const panel = panelOf(event.currentTarget)
    const rect = panel.getBoundingClientRect()
    const keys = {
      ArrowLeft: { width: rect.width - xSign * step }, ArrowRight: { width: rect.width + xSign * step },
      ArrowUp: heightVar ? { height: rect.height - ySign * step } : null, ArrowDown: heightVar ? { height: rect.height + ySign * step } : null,
    }
    const change = keys[event.key]
    if (!change) return
    event.preventDefault()
    const saved = readStored(storageKey) || {}
    store(storageKey, { ...saved, ...apply(change, panel) })
  }
  function onDoubleClick() {
    document.documentElement.style.removeProperty(widthVar)
    if (heightVar) document.documentElement.style.removeProperty(heightVar)
    try { localStorage.removeItem(storageKey) } catch { /* ignore */ }
  }

  return <div
    className={`panel-resize-corner is-${corner}`}
    role="separator"
    aria-label={label}
    title={`${label} · drag the corner or use arrow keys · double-click to reset`}
    tabIndex={0}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerUp}
    onPointerCancel={onPointerUp}
    onKeyDown={onKeyDown}
    onDoubleClick={onDoubleClick}
  ><svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2 10 10 2M6 10 10 6" /></svg></div>
}
