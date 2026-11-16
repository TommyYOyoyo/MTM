import { useState } from 'react'
import './pca-chart.css'

const W = 320
const H = 180
const PAD = { left: 28, right: 28, top: 14, bottom: 30 }
const FACTORS = [['slope', 'Slope'], ['roughness', 'Roughness'], ['thermal', 'Thermal'], ['albedo', 'Albedo'], ['sun', 'Sun']]

// pca scatter: hover / focus a dot --> it grows + gets a ring, card shows its data
export default function PcaChart({ points, colorFor, planetOf = {}, siteById = {}, selectedId = null, label }) {
  const [hoverId, setHoverId] = useState(null)
  if (!points.length) return null

  const span = (key) => {
    const values = points.map((point) => point[key])
    const low = Math.min(...values)
    const high = Math.max(...values)
    return (value) => high === low ? 0.5 : (value - low) / (high - low)
  }
  const sx = span('pc1')
  const sy = span('pc2')
  const xOf = (point) => PAD.left + sx(point.pc1) * (W - PAD.left - PAD.right)
  const yOf = (point) => H - PAD.bottom - sy(point.pc2) * (H - PAD.top - PAD.bottom)

  const active = points.find((point) => point.id === (hoverId || selectedId)) || null
  const hovered = points.find((point) => point.id === hoverId) || null
  // draw the active dot last so it sits on top
  const ordered = active ? [...points.filter((point) => point !== active), active] : points

  return <div className="pca-chart" onMouseLeave={() => setHoverId(null)}>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <path className="pca-axes" d={`M${PAD.left - 4} ${PAD.top - 2}V${H - PAD.bottom + 4}H${W - PAD.right + 4}`} />
      {ordered.map((point) => {
        const isActive = point === active
        const dim = hovered && !isActive && point.family !== hovered.family
        const cx = xOf(point)
        const cy = yOf(point)
        const r = isActive ? 6 : 4
        const mars = (point.planet || planetOf[point.id]) === 'mars'
        const shape = mars
          ? <circle cx={cx} cy={cy} r={r} />
          : <rect x={cx - r * 0.85} y={cy - r * 0.85} width={r * 1.7} height={r * 1.7} rx="1" />
        return <g key={point.id} className={`pca-point${isActive ? ' is-active' : ''}${dim ? ' is-dim' : ''}`} fill={colorFor(point)} tabIndex={0} role="button" aria-label={`${point.name || point.id}, ${point.family || ''}`}
          onMouseEnter={() => setHoverId(point.id)} onFocus={() => setHoverId(point.id)} onBlur={() => setHoverId(null)}>
          {isActive && <circle className="pca-ring" cx={cx} cy={cy} r={r + 4} />}
          {shape}
          <circle className="pca-hit" cx={cx} cy={cy} r="9" />
        </g>
      })}
      <text className="pca-axis-label" x={W - PAD.right + 4} y={H - 8} textAnchor="end">PC1</text>
      <text className="pca-axis-label" x="4" y={PAD.top + 2}>PC2</text>
    </svg>

    {hovered && <div className={`pca-card${xOf(hovered) > W / 2 ? ' is-left' : ''}`} style={{ left: `${xOf(hovered) / W * 100}%`, top: `${yOf(hovered) / H * 100}%` }} role="status">
      <strong>{hovered.name || hovered.id}</strong>
      <span className="pca-card-meta">{(hovered.planet || planetOf[hovered.id]) === 'mars' ? 'Mars' : 'Earth'} · {hovered.family || 'No family'}</span>
      {siteById[hovered.id]?.n && <dl>{FACTORS.map(([key, name]) => <div key={key}><dt>{name}</dt><dd>{Number.isFinite(siteById[hovered.id].n[key]) ? siteById[hovered.id].n[key].toFixed(2) : '—'}</dd></div>)}</dl>}
      <span className="pca-card-meta">PC1 {hovered.pc1.toFixed(2)} · PC2 {hovered.pc2.toFixed(2)}</span>
      {hovered.outlier && <span className="pca-card-flag">Unusual measurements</span>}
    </div>}
  </div>
}
