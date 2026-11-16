import { useState } from 'react'

// phoenix met: one row per sol [sol, pressure Pa, min °C, max °C]
// temperature = band (night low to day high), pressure = line. hover --> that sol's values
export default function MetSparkline({ series }) {
  const [hover, setHover] = useState(null)
  const rows = series.filter((row) => Array.isArray(row) && Number.isFinite(row[0]))
  if (rows.length < 2) return null
  const first = rows[0][0]
  const last = rows.at(-1)[0]
  const x = (sol) => (sol - first) / (last - first || 1) * 100

  const chart = (pick) => {
    const values = rows.flatMap(pick).filter(Number.isFinite)
    const low = Math.min(...values)
    const high = Math.max(...values)
    const y = (value) => 30 - (value - low) / (high - low || 1) * 28 - 1
    return { low, high, y }
  }
  const temp = chart((row) => [row[2], row[3]])
  const pres = chart((row) => [row[1]])
  const band = [...rows.map((row) => `${x(row[0]).toFixed(2)},${temp.y(row[3]).toFixed(2)}`), ...rows.slice().reverse().map((row) => `${x(row[0]).toFixed(2)},${temp.y(row[2]).toFixed(2)}`)].join(' ')
  const line = (pick, scale) => rows.filter((row) => Number.isFinite(pick(row))).map((row) => `${x(row[0]).toFixed(2)},${scale.y(pick(row)).toFixed(2)}`).join(' ')
  const active = hover === null ? null : rows[hover]

  function onMove(event) {
    const box = event.currentTarget.getBoundingClientRect()
    const sol = first + (event.clientX - box.left) / box.width * (last - first)
    let best = 0
    rows.forEach((row, i) => { if (Math.abs(row[0] - sol) < Math.abs(rows[best][0] - sol)) best = i })
    setHover(best)
  }

  const plot = (children, label) => <svg viewBox="0 0 100 30" preserveAspectRatio="none" role="img" aria-label={label} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
    {children}
    {active && <line className="sparkline-hover" x1={x(active[0])} x2={x(active[0])} y1="0" y2="30" />}
  </svg>

  return <div className="met-sparklines">
    <div className="sparkline is-temperature">
      <div className="sparkline-head"><strong>Air temperature, 1 m</strong><span>{active ? `Sol ${active[0]}: ${active[2]} to ${active[3]} °C` : `${Math.round(temp.low)} to ${Math.round(temp.high)} °C`}</span></div>
      {plot(<><polygon className="sparkline-band" points={band} /><polyline className="sparkline-line" points={line((row) => row[3], temp)} /><polyline className="sparkline-line" points={line((row) => row[2], temp)} /></>, `Daily air temperature range over sols ${first} to ${last}, from ${Math.round(temp.low)} to ${Math.round(temp.high)} degrees Celsius`)}
    </div>
    <div className="sparkline is-pressure">
      <div className="sparkline-head"><strong>Surface pressure</strong><span>{active && Number.isFinite(active[1]) ? `Sol ${active[0]}: ${active[1]} Pa` : `${Math.round(pres.low)} to ${Math.round(pres.high)} Pa`}</span></div>
      {plot(<polyline className="sparkline-line" points={line((row) => row[1], pres)} />, `Daily mean pressure over sols ${first} to ${last}, from ${Math.round(pres.low)} to ${Math.round(pres.high)} pascals`)}
      <div className="sparkline-axis" aria-hidden="true"><span>Sol {first}</span><span>Sol {last}</span></div>
    </div>
    <p className="comparison-score-note">Pressure falls through the mission as CO₂ freezes onto the southern polar cap (southern winter). Earth sea level is ~101,000 Pa.</p>
  </div>
}
