export const DRAWER_DRAG_THRESHOLD = 6
export const DRAWER_COLLAPSE_DISTANCE = 24

export function clampDrawerHeight(height, collapsedHeight, maxHeight) {
  return Math.max(collapsedHeight, Math.min(height, maxHeight))
}

// Rectangles use viewport coordinates, just like pointer clientY.
export function getDrawerMaxHeight({ drawerRect, blockerRects = [], viewportTop = 0, viewportHeight, gap = 12 }) {
  const bottom = Math.min(drawerRect.bottom, viewportTop + viewportHeight)
  let top = viewportTop + gap
  for (const blocker of blockerRects) {
    const overlaps = blocker.right > drawerRect.left && blocker.left < drawerRect.right
    if (overlaps && blocker.width > 0 && blocker.height > 0) {
      top = Math.max(top, blocker.bottom + gap)
    }
  }
  return Math.max(0, bottom - top)
}

export function getInitialDrawerHeight({ view, viewportHeight, collapsedHeight, maxHeight }) {
  const preferred = view === 'checks' ? maxHeight : collapsedHeight + Math.min(viewportHeight * 0.55, 416)
  return clampDrawerHeight(preferred, collapsedHeight, maxHeight)
}

export function getDraggedDrawerHeight({ startHeight, startY, clientY, collapsedHeight, maxHeight }) {
  return clampDrawerHeight(startHeight + startY - clientY, collapsedHeight, maxHeight)
}
