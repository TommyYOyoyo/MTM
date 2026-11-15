import test from 'node:test'
import assert from 'node:assert/strict'
import { clampDrawerHeight, getDraggedDrawerHeight, getDrawerMaxHeight, getInitialDrawerHeight } from './drawerSizing.js'

const drawerRect = { left: 24, right: 424, bottom: 900 }
const blocker = (left, right, bottom) => ({ left, right, top: 92, bottom, width: right - left, height: bottom - 92 })

test('the expanded Compare panel reserves its complete height and a gap', () => {
  assert.equal(getDrawerMaxHeight({ drawerRect, viewportHeight: 900, blockerRects: [blocker(24, 424, 138)] }), 750)
  assert.equal(getDrawerMaxHeight({ drawerRect, viewportHeight: 900, blockerRects: [blocker(24, 424, 698)] }), 190)
})

test('only visible blockers that horizontally overlap the drawer constrain it', () => {
  assert.equal(getDrawerMaxHeight({ drawerRect, viewportHeight: 900, blockerRects: [blocker(500, 800, 700), { ...blocker(24, 424, 700), height: 0 }] }), 888)
  assert.equal(getDrawerMaxHeight({ drawerRect, viewportHeight: 900, blockerRects: [blocker(423, 800, 700)] }), 188)
})

test('visual viewport and bottom clearance constrain the usable height', () => {
  assert.equal(getDrawerMaxHeight({ drawerRect, viewportTop: 100, viewportHeight: 500 }), 488)
  assert.equal(getDrawerMaxHeight({ drawerRect: { ...drawerRect, bottom: 820 }, viewportHeight: 900 }), 808)
  assert.equal(getDrawerMaxHeight({ drawerRect, viewportHeight: 600, blockerRects: [blocker(24, 424, 700)] }), 0)
})

test('research initially uses available height while browse retains its content-sized default', () => {
  const bounds = { collapsedHeight: 86, viewportHeight: 900, maxHeight: 750 }
  assert.equal(getInitialDrawerHeight({ ...bounds, view: 'checks' }), 750)
  assert.equal(getInitialDrawerHeight({ ...bounds, view: 'browse' }), 502)
  assert.equal(getInitialDrawerHeight({ ...bounds, view: 'browse', maxHeight: 190 }), 190)
  assert.equal(getInitialDrawerHeight({ ...bounds, view: 'browse', viewportHeight: 600 }), 416)
})

test('pointer position produces continuous heights in both directions within the measured bounds', () => {
  const gesture = { startHeight: 400, startY: 500, collapsedHeight: 86, maxHeight: 750 }
  assert.equal(getDraggedDrawerHeight({ ...gesture, clientY: 480 }), 420)
  assert.equal(getDraggedDrawerHeight({ ...gesture, clientY: 469 }), 431)
  assert.equal(getDraggedDrawerHeight({ ...gesture, clientY: 600 }), 300)
  assert.equal(getDraggedDrawerHeight({ ...gesture, clientY: 1000 }), 86)
  assert.equal(getDraggedDrawerHeight({ ...gesture, clientY: 0 }), 750)
})

test('clamping a preference does not mutate it, allowing restoration after Compare closes', () => {
  const preferred = 650
  assert.equal(clampDrawerHeight(preferred, 86, 190), 190)
  assert.equal(clampDrawerHeight(preferred, 86, 750), 650)
})
