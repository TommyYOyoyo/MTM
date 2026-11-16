import { useId } from 'react'
import './site-analysis.css'
import PcaChart from './PcaChart.jsx'

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

  const variance = families.metadata?.explained_variance
  const explained = Array.isArray(variance) && variance.length >= 2 && variance.slice(0, 2).every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
    ? variance[0] + variance[1]
    : null
  const family = typeof selected.family === 'string' ? selected.family : 'Family unavailable'
  const nameOf = (id) => points.find((point) => point.id === id)?.name || id
  const neighbours = Array.isArray(selected.neighbours) ? selected.neighbours.filter((entry) => entry && typeof entry.id === 'string') : []

  return <section className="site-analysis" aria-labelledby={`${id}-heading`}>
    <div className="site-analysis-heading"><h2 id={`${id}-heading`}>Python analysis</h2><span>PCA + k-means</span></div>
    <p className="site-analysis-family">{family}</p>
    <PcaChart points={points} colorFor={(point) => point.id === selected.id ? '#ffffff' : '#9a9a97'} selectedId={selected.id} label={`Saved PCA of ${points.length} locations; ${site.name || site.id} is the white point. Hover a point for its data.`} />
    <div className="site-analysis-caption"><span><i aria-hidden="true" />Selected location</span>{explained !== null && explained <= 1 && <span>{(explained * 100).toFixed(1)}% variance shown</span>}</div>
    {selected.outlier && <p className="site-analysis-flag">Unusual measurements: flagged by an isolation forest as one of the most atypical sites. Check its data before relying on it.</p>}
    {neighbours.length > 0 && <div className="site-analysis-neighbours"><p>Closest on {selected.planet === 'mars' ? 'Earth' : 'Mars'} by measurements alone <span>· k-nearest neighbours</span></p><ol>{neighbours.map((entry) => <li key={entry.id}><span>{nameOf(entry.id)}</span><span>{Number.isFinite(entry.distance) ? entry.distance.toFixed(2) : ''}</span></li>)}</ol></div>}
    <p className="site-analysis-note">Saved PCA snapshot · separate from match scores</p>
  </section>
}
