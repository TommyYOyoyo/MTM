// Camera altitude is measured in globe radii by react-globe.gl.
export function markerAppearance(altitude) {
  if (!Number.isFinite(altitude)) return null
  const clamp = (value) => Math.max(0, Math.min(1, value))
  const distance = clamp((altitude - 0.12) / 0.68)
  const close = clamp((altitude - 0.04) / 0.08)
  const opacity = altitude >= 0.12 ? 0.5 + 0.5 * distance : 0.5 * close
  return {
    fill: Math.round(opacity * 50) / 50,
    outline: Math.round(clamp((0.18 - altitude) / 0.14) * 50) / 50,
  }
}
