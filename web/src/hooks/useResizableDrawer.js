import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clampDrawerHeight,
  DRAWER_COLLAPSE_DISTANCE,
  DRAWER_DRAG_THRESHOLD,
  getDraggedDrawerHeight,
  getDrawerMaxHeight,
  getInitialDrawerHeight,
} from '../lib/drawerSizing.js'

const pixels = (value) => Number.parseFloat(value) || 0

function releaseCapture(gesture) {
  if (gesture?.target.hasPointerCapture?.(gesture.pointerId)) {
    try { gesture.target.releasePointerCapture(gesture.pointerId) } catch { /* The pointer may already be gone. */ }
  }
}

export default function useResizableDrawer({ drawerRef, controlsRef, searchRef, enabled, collapsed, onCollapsedChange, view, isMobile }) {
  const [size, setSize] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const boundsRef = useRef(null)
  const heightRef = useRef(null)
  const preferredRef = useRef(new Map())
  const gestureRef = useRef(null)
  const suppressClickRef = useRef(false)

  const publishHeight = useCallback((height, maxHeight) => {
    heightRef.current = height
    setSize((previous) => previous?.height === height && previous.maxHeight === maxHeight
      ? previous
      : { height, maxHeight })
  }, [])

  const preferredHeight = useCallback((bounds) => preferredRef.current.get(view) ?? getInitialDrawerHeight({ view, ...bounds }), [view])

  const measure = useCallback(() => {
    const drawer = drawerRef.current
    if (!drawer || !drawer.getClientRects().length) return
    const handle = drawer.querySelector('[data-drawer-handle]')
    if (!handle) return
    const rect = drawer.getBoundingClientRect()
    const css = window.getComputedStyle(drawer)
    const collapsedHeight = handle.getBoundingClientRect().height + pixels(css.paddingTop) + pixels(css.paddingBottom) + pixels(css.borderTopWidth) + pixels(css.borderBottomWidth)
    const viewport = window.visualViewport
    const viewportHeight = viewport?.height ?? window.innerHeight
    const blockerRects = [controlsRef.current, searchRef.current]
      .filter((element) => element && element.getClientRects().length)
      .map((element) => element.getBoundingClientRect())
    const maxHeight = Math.max(collapsedHeight, getDrawerMaxHeight({
      drawerRect: rect,
      blockerRects,
      viewportTop: viewport?.offsetTop ?? 0,
      viewportHeight,
    }))
    const bounds = { collapsedHeight, maxHeight, viewportHeight }
    boundsRef.current = bounds
    const height = gestureRef.current?.dragging
      ? heightRef.current
      : collapsed ? collapsedHeight : preferredHeight(bounds)
    publishHeight(clampDrawerHeight(height, collapsedHeight, maxHeight), maxHeight)
  }, [drawerRef, controlsRef, searchRef, collapsed, preferredHeight, publishHeight])

  useEffect(() => {
    if (!enabled) return
    let frame = 0
    const scheduleMeasure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    scheduleMeasure()
    const drawer = drawerRef.current
    const handle = drawer?.querySelector('[data-drawer-handle]')
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleMeasure)
    for (const element of [handle, controlsRef.current, searchRef.current]) {
      if (element) observer?.observe(element)
    }
    // details toggles can change which descendants participate in layout.
    const controls = controlsRef.current
    controls?.addEventListener('toggle', scheduleMeasure)
    window.addEventListener('resize', scheduleMeasure)
    window.visualViewport?.addEventListener('resize', scheduleMeasure)
    window.visualViewport?.addEventListener('scroll', scheduleMeasure)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      controls?.removeEventListener('toggle', scheduleMeasure)
      window.removeEventListener('resize', scheduleMeasure)
      window.visualViewport?.removeEventListener('resize', scheduleMeasure)
      window.visualViewport?.removeEventListener('scroll', scheduleMeasure)
    }
  }, [enabled, isMobile, view, measure, drawerRef, controlsRef, searchRef])

  useEffect(() => {
    const frame = !enabled ? requestAnimationFrame(() => setIsDragging(false)) : 0
    return () => {
      cancelAnimationFrame(frame)
      releaseCapture(gestureRef.current)
      gestureRef.current = null
    }
  }, [enabled])

  const onPointerDown = useCallback((event) => {
    if (!enabled || event.isPrimary === false || event.button !== 0 || gestureRef.current) return
    if (!boundsRef.current) measure()
    if (!boundsRef.current) return
    suppressClickRef.current = false
    gestureRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: drawerRef.current?.getBoundingClientRect().height || heightRef.current,
      startCollapsed: collapsed,
      previousPreferred: preferredRef.current.get(view),
      dragging: false,
      target: event.currentTarget,
    }
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Ignore a pointer that ended before capture. */ }
  }, [enabled, measure, drawerRef, collapsed, view])

  const onPointerMove = useCallback((event) => {
    const gesture = gestureRef.current
    const bounds = boundsRef.current
    if (!gesture || gesture.pointerId !== event.pointerId || !bounds) return
    if (!gesture.dragging) {
      if (Math.abs(event.clientY - gesture.startY) < DRAWER_DRAG_THRESHOLD) return
      gesture.dragging = true
      setIsDragging(true)
      onCollapsedChange(false)
    }
    event.preventDefault()
    const height = getDraggedDrawerHeight({ ...gesture, clientY: event.clientY, ...bounds })
    preferredRef.current.set(view, height)
    publishHeight(height, bounds.maxHeight)
  }, [onCollapsedChange, publishHeight, view])

  const finishPointer = useCallback((event, cancelled) => {
    const gesture = gestureRef.current
    const bounds = boundsRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    gestureRef.current = null
    releaseCapture(gesture)
    if (!gesture.dragging || !bounds) return
    setIsDragging(false)
    suppressClickRef.current = true
    if (cancelled) {
      if (gesture.previousPreferred === undefined) preferredRef.current.delete(view)
      else preferredRef.current.set(view, gesture.previousPreferred)
      onCollapsedChange(gesture.startCollapsed)
      publishHeight(clampDrawerHeight(gesture.startHeight, bounds.collapsedHeight, bounds.maxHeight), bounds.maxHeight)
      return
    }
    const shouldCollapse = heightRef.current <= bounds.collapsedHeight + DRAWER_COLLAPSE_DISTANCE
    onCollapsedChange(shouldCollapse)
    if (shouldCollapse) {
      // A closing drag should keep a useful height for the next expansion.
      if (gesture.previousPreferred === undefined) preferredRef.current.delete(view)
      else preferredRef.current.set(view, gesture.previousPreferred)
      publishHeight(bounds.collapsedHeight, bounds.maxHeight)
    }
  }, [onCollapsedChange, publishHeight, view])

  const onPointerUp = useCallback((event) => finishPointer(event, false), [finishPointer])
  const onPointerCancel = useCallback((event) => finishPointer(event, true), [finishPointer])

  const onClick = useCallback((event) => {
    const suppress = suppressClickRef.current && event.detail !== 0
    suppressClickRef.current = false
    if (suppress) return
    const bounds = boundsRef.current
    if (bounds) publishHeight(collapsed ? clampDrawerHeight(preferredHeight(bounds), bounds.collapsedHeight, bounds.maxHeight) : bounds.collapsedHeight, bounds.maxHeight)
    onCollapsedChange(!collapsed)
  }, [collapsed, onCollapsedChange, preferredHeight, publishHeight])

  const onKeyDown = useCallback((event) => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
    const bounds = boundsRef.current
    if (!bounds) return
    event.preventDefault()
    const current = collapsed ? bounds.collapsedHeight : heightRef.current
    const next = event.key === 'Home' ? bounds.collapsedHeight : event.key === 'End' ? bounds.maxHeight : current + (event.key === 'ArrowUp' ? 48 : -48)
    const height = clampDrawerHeight(next, bounds.collapsedHeight, bounds.maxHeight)
    const shouldCollapse = height <= bounds.collapsedHeight
    if (!shouldCollapse) preferredRef.current.set(view, height)
    publishHeight(height, bounds.maxHeight)
    onCollapsedChange(shouldCollapse)
  }, [collapsed, onCollapsedChange, publishHeight, view])

  return {
    style: size ? { '--drawer-height': `${size.height}px`, '--drawer-max-height': `${size.maxHeight}px` } : undefined,
    isDragging,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClick,
    onKeyDown,
  }
}
