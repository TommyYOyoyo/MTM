import { histogram } from '../lib/insights.js'
import './match-insights.css'

const AXES = [['slope', 'Slope'], ['roughness', 'Roughness'], ['thermal', 'Thermal'], ['albedo', 'Albedo'], ['sun', 'Sun']]
const fmtKm = (km) => km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km).toLocaleString()} km`

// "new ground" vs near a famous analog --> is this a discovery or a known place
export function KnownTag({ known, compact = false }) {
  if (!known) return null
  const text = known.tag === 'known' ? 'Known analog' : known.tag === 'new' ? `New ground${compact ? '' : ` · ${fmtKm(known.km)} from ${known.near.name}`}` : `${known.label} · ${fmtKm(known.km)}`
  return <span className="known-tag" data-tag={known.tag} title={known.tag === 'known' ? 'Published analog site' : `Closest published analog: ${known.near.name} (${fmtKm(known.km)})`}>{text}</span>
}

// null baseline: where this match sits among 340 random dry land places
export function BaselineChart({ baseline }) {
  if (!baseline) return null
  // zoom the axis on where the scores actually are (they rarely go under 50)
  const low = Math.max(0, Math.floor(Math.min(baseline.score, baseline.scores[0]) / 10) * 10)
  const bins = histogram(baseline.scores, 2.5, low)
  const peak = Math.max(...bins.map((bin) => bin.count), 1)
  const percent = Math.round(baseline.share * 100)
  const marker = (Math.max(low, Math.min(100, baseline.score)) - low) / (100 - low) * 100
  return <div className="baseline">
    <p className="baseline-headline"><strong>Beats {percent}%</strong> of {baseline.count} random dry land places</p>
    <div className="baseline-chart" role="img" aria-label={`Score distribution of ${baseline.count} random Earth places; this site scores ${baseline.score.toFixed(1)}, higher than ${percent} percent of them`}>
      {bins.map((bin) => <span key={bin.from} className={bin.from + 2.5 <= baseline.score ? 'is-below' : ''} style={{ height: `${Math.max(bin.count ? 6 : 0, bin.count / peak * 100)}%` }} />)}
      <i className="baseline-marker" style={{ left: `${marker}%` }} aria-hidden="true"><b>{baseline.score.toFixed(0)}</b></i>
    </div>
    <div className="baseline-axis" aria-hidden="true"><span>{low}</span><span>{Math.round((low + 100) / 2)}</span><span>100</span></div>
    <p className="comparison-score-note">Terrain + surface factors only (the random places have no ice or geology data), same weights as the ranking.</p>
  </div>
}

// radar: the 5 scoring inputs (0-1) of the mars target vs the earth site
export function RadarChart({ target, site }) {
  const size = 200
  const mid = size / 2
  const radius = 72
  const angle = (i) => -Math.PI / 2 + i * 2 * Math.PI / AXES.length
  const point = (i, value) => [mid + Math.cos(angle(i)) * radius * value, mid + Math.sin(angle(i)) * radius * value]
  const shape = (entry) => AXES.map(([key], i) => point(i, Number.isFinite(entry?.n?.[key]) ? Math.max(0, Math.min(1, entry.n[key])) : 0).map((v) => v.toFixed(1)).join(',')).join(' ')
  if (!AXES.some(([key]) => Number.isFinite(target?.n?.[key]) && Number.isFinite(site?.n?.[key]))) return null
  return <figure className="radar">
    <svg viewBox={`-34 -6 ${size + 68} ${size + 12}`} role="img" aria-label={`Scoring inputs of ${target.name} and ${site.name}: ${AXES.map(([key, label]) => `${label} ${target.n?.[key]?.toFixed?.(2) ?? 'missing'} vs ${site.n?.[key]?.toFixed?.(2) ?? 'missing'}`).join(', ')}`}>
      {[0.25, 0.5, 0.75, 1].map((ring) => <polygon key={ring} className="radar-ring" points={AXES.map((_, i) => point(i, ring).join(',')).join(' ')} />)}
      {AXES.map(([key, label], i) => {
        const [x, y] = point(i, 1)
        const [lx, ly] = point(i, 1.22)
        return <g key={key}><line className="radar-spoke" x1={mid} y1={mid} x2={x} y2={y} /><text className="radar-label" x={lx} y={ly} textAnchor={Math.abs(lx - mid) < 4 ? 'middle' : lx > mid ? 'start' : 'end'} dominantBaseline="middle">{label}</text></g>
      })}
      <polygon className="radar-shape is-target" points={shape(target)} />
      <polygon className="radar-shape is-site" points={shape(site)} />
    </svg>
    <figcaption><span><i className="is-target" aria-hidden="true" />{target.name}</span><span><i className="is-site" aria-hidden="true" />{site.name}</span></figcaption>
  </figure>
}
