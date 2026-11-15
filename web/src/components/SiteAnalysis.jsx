import { useId } from 'react'
import './site-analysis.css'

const PLOT = { width: 300, height: 168, left: 25, right: 14, top: 12, bottom: 25 }

function extent(points, key) {
  const values = points.map((point) => point[key])
  const min = Math.min(...values)
  const max = Math.max(...values)
  const padding = (max - min || 1) * .1
  return [min - padding, max + padding]
}

export default function SiteAnalysis({ site, families = null }) {
  const id = useId()
  if (!site || !families) return null

  const points = Array.isArray(families.points)
    ? families.points.filter((point) => point && typeof point.id === 'string' && Number.isFinite(point.pc1) && Number.isFinite(point.pc2))
    : []
  const selected = points.find((point) => point.id === site.id)

  if (!selected) return <section className="site-analysis" aria-labelledby={`${id}-heading`}>
    <h2 id={`${id}-heading`}>Python analysis</h2>
    <p className="site-analysis-note">No saved PCA result for this location.</p>
  </section>

  const [minX, maxX] = extent(points, 'pc1')
  const [minY, maxY] = extent(points, 'pc2')
  const right = PLOT.width - PLOT.right
  const bottom = PLOT.height - PLOT.bottom
  const x = (value) => PLOT.left + (value - minX) / (maxX - minX) * (right - PLOT.left)
  const y = (value) => bottom - (value - minY) / (maxY - minY) * (bottom - PLOT.top)
  const variance = families.metadata?.explained_variance
  const explained = Array.isArray(variance) && variance.length >= 2 && variance.slice(0, 2).every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
    ? variance[0] + variance[1]
    : null
  const family = typeof selected.family === 'string' ? selected.family : 'Family unavailable'
  const ordered = [...points.filter((point) => point !== selected), selected]

  return <section className="site-analysis" aria-labelledby={`${id}-heading`}>
    <div className="site-analysis-heading"><h2 id={`${id}-heading`}>Python analysis</h2><span>PCA + k-means</span></div>
    <p className="site-analysis-family">{family}</p>
    <svg className="site-analysis-plot" viewBox={`0 0 ${PLOT.width} ${PLOT.height}`} role="img" aria-labelledby={`${id}-title ${id}-description`}>
      <title id={`${id}-title`}>Saved PCA analysis of {points.length} locations</title>
      <desc id={`${id}-description`}>{site.name || site.id} is highlighted with a larger white point. {family}. Positions show the first two principal components of the saved slope, roughness, thermal, albedo and sun inputs. This plot is separate from match scores.</desc>
      <path className="site-analysis-axes" d={`M ${PLOT.left} ${PLOT.top} V ${bottom} H ${right}`} />
      {minX < 0 && maxX > 0 && <line className="site-analysis-zero" x1={x(0)} x2={x(0)} y1={PLOT.top} y2={bottom} />}
      {minY < 0 && maxY > 0 && <line className="site-analysis-zero" x1={PLOT.left} x2={right} y1={y(0)} y2={y(0)} />}
      {ordered.map((point, index) => <circle key={`${point.id}-${index}`} className={`site-analysis-point${point === selected ? ' is-selected' : ''}`} cx={x(point.pc1)} cy={y(point.pc2)} r={point === selected ? 5 : 2.75}>
        <title>{point.name || point.id}{point === selected ? ' · Selected location' : ''} · {point.family || 'Family unavailable'} · PC1 {point.pc1}, PC2 {point.pc2}</title>
      </circle>)}
      <text className="site-analysis-axis-label" x={right} y={PLOT.height - 5} textAnchor="end">PC1</text>
      <text className="site-analysis-axis-label" x="5" y={PLOT.top + 4}>PC2</text>
    </svg>
    <div className="site-analysis-caption"><span><i aria-hidden="true" />Selected location</span>{explained !== null && explained <= 1 && <span>{(explained * 100).toFixed(1)}% variance shown</span>}</div>
    <p className="site-analysis-note">Saved PCA snapshot · separate from match scores</p>
  </section>
}
