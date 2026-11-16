import { useMemo } from 'react'
import { benchmarkStability, benchmarkStatistics, safeExternalUrl } from '../lib/comparison.js'
import PcaChart from './PcaChart.jsx'
import './research-tools.css'

// one soft colour per family
const FAMILY_COLORS = ['#efbf9d', '#9dbfe0', '#a9cfa0', '#d3b2e0', '#e2d69a', '#c9c9c4']

const familyKey = (point) => point.family ?? (Number.isFinite(point.cluster) ? `Family ${point.cluster + 1}` : 'Unassigned')
const formatP = (value) => value < 0.001 ? '< 0.001' : value.toFixed(3)

const statusLabel = { unconfigured: 'Pairing needed', placeholder: 'Sample only', missing: 'Data needed', pass: 'Top five', fail: 'Outside top five' }

function exportValidation(rows) {
  const cell = (value) => {
    const text = String(value ?? '')
    return `"${(/^[=+@-]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`
  }
  const csv = [['benchmark', 'mars_target', 'rank', 'score', 'status'], ...rows.map((row) => [row.site.name, row.target?.name || row.targetId, row.rank, row.score, row.status])].map((row) => row.map(cell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'space-out-benchmark-validation.csv'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// rank range under 500 random weightings: grey band = 10th-90th percentile, dot = default rank, shaded = top 5
function StabilityBar({ entry, rank, count }) {
  const total = Math.max(count || 0, entry.high || 0, rank || 0, 5)
  const at = (value) => `${(value - 1) / Math.max(1, total - 1) * 100}%`
  return <div className="benchmark-stability" title="Re-ranked under 500 random weightings of the factors">
    <div className="stability-track" role="img" aria-label={`Rank ${entry.low} to ${entry.high} across random weightings, top five in ${Math.round(entry.share * 100)} percent`}>
      <span className="stability-top" style={{ width: at(5.5) }} />
      <span className="stability-range" style={{ left: at(entry.low), width: `calc(${at(entry.high)} - ${at(entry.low)})` }} />
      {Number.isFinite(rank) && <i className="stability-rank" style={{ left: at(rank) }} />}
    </div>
    <div className="stability-axis" aria-hidden="true"><span className="stability-axis-top" style={{ width: at(5.5) }}>top 5</span><span className="stability-axis-end">#{total}</span></div>
    <small>Top five in {Math.round(entry.share * 100)}% of 500 random weightings · rank {entry.low}–{entry.high} (10th–90th percentile)</small>
  </div>
}

export default function ResearchTools({ report, families, sites }) {
  const rows = report?.rows || []
  const values = Array.isArray(families) ? families : Array.isArray(families?.points) ? families.points : []
  const points = values.filter((point) => point && Number.isFinite(point.pc1) && Number.isFinite(point.pc2))
  const sources = [...new Map((sites || []).flatMap((site) => site.sources || []).map((source) => [source.href || source.url, source])).values()].filter((source) => safeExternalUrl(source.href || source.url))
  const stats = benchmarkStatistics(report, sites || [])
  const stability = useMemo(() => benchmarkStability(sites || []), [sites])
  const stabilityFor = (row) => stability.find((entry) => entry.site.id === row.site.id && entry.target.id === row.target?.id)
  const familyNames = [...new Set(points.map(familyKey))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const colorFor = (point) => FAMILY_COLORS[familyNames.indexOf(familyKey(point)) % FAMILY_COLORS.length]
  const planetOf = Object.fromEntries((sites || []).map((site) => [site.id, site.planet]))
  const siteById = Object.fromEntries((sites || []).map((site) => [site.id, site]))

  return <div className="research-tools">
    <div className="research-heading">
      <div><h2>Benchmarks</h2><p>Known analogs, default weights.</p></div>
      <button className="comparison-secondary-action research-export" type="button" onClick={() => exportValidation(rows)} disabled={!rows.length}>Export CSV <span aria-hidden="true">↗</span></button>
    </div>
    <dl className="research-summary" aria-label="Top-five benchmark checks">
      <div><dt>Top-five checks met</dt><dd>{report?.passed || 0}</dd></div>
      <div><dt>Pending</dt><dd>{report?.pending || 0}</dd></div>
    </dl>
    {stats && <div className="research-stats" aria-label="Validation statistics">
      <p><strong>{stats.hits} of {stats.total}</strong> known analogs rank in the top {stats.topK} of {stats.earthCount} Earth sites. A random ranking would place each one there {Math.round(stats.chance * 100)}% of the time; doing this well by chance has probability <strong>p = {formatP(stats.pValue)}</strong> (one-sided binomial test).</p>
      <p className="comparison-muted">Default weights, no tuning. Earth “permafrost” and Mars “ground ice” are scored as the same ice-cemented ground; before that label was harmonized, 3 of 6 met the check. Six pairs is early evidence, not proof.</p>
    </div>}
    {rows.length ? <ul className="benchmark-list">{rows.map((row, index) => <li className="benchmark-card" key={`${row.site.id}-${row.target?.id || index}`}>
      <div className="benchmark-copy"><strong>{row.site.name}</strong><span>{row.target?.name || row.targetId || 'Mars pairing pending'}</span></div>
      <div className="benchmark-rank"><span>Rank</span><strong>{Number.isFinite(row.rank) ? row.rank : '—'}</strong></div>
      <span className="benchmark-status" data-status={row.status}>{statusLabel[row.status] || 'Pending'}</span>
      {row.reason && <small className="benchmark-reason">{row.reason}</small>}
      {stabilityFor(row)?.share !== null && stabilityFor(row) && <StabilityBar entry={stabilityFor(row)} rank={row.rank} count={stats?.earthCount} />}
    </li>)}</ul> : <p className="comparison-empty">No benchmark sites supplied yet.</p>}
    <div className="research-disclosures">
      <details className="research-section"><summary>Analog families <span className="research-section-meta">{points.length ? `${points.length} sites` : 'Optional'}</span></summary><div className="research-section-body"><p>Optional site groupings. Resemblance scores are unchanged.</p>{points.length ? <><PcaChart points={points} colorFor={colorFor} planetOf={planetOf} siteById={siteById} label="Site families on the first two principal components. Hover or focus a point for its data." />
        <ul className="research-family-legend" aria-label="Chart legend">
          {familyNames.map((family, index) => <li key={family}><i style={{ background: FAMILY_COLORS[index % FAMILY_COLORS.length] }} aria-hidden="true" />{family}</li>)}
          <li><i className="is-mars" aria-hidden="true" />Mars</li>
          <li><i className="is-earth" aria-hidden="true" />Earth</li>
        </ul>
        <ul className="research-family-list">{points.map((point, index) => <li key={`${point.id}-${index}`}><span><i className={(point.planet || planetOf[point.id]) === 'mars' ? 'is-mars' : 'is-earth'} style={{ background: colorFor(point) }} aria-hidden="true" />{point.name || point.id}</span><span>{familyKey(point)}</span></li>)}</ul></> : <p className="comparison-empty">Analysis not connected yet.</p>}</div></details>
      <details className="research-section"><summary>Method & limitations</summary><div className="research-section-body"><p>Weighted Gower resemblance compares normalized numbers, ice categories, geology tags, and subsurface features. Subsurface (caves, lava tubes) is built in but not scored yet: teammates proposed tags for 8 sites and none held up against sources.</p><p>Missing factors are excluded and the remaining weights are renormalized. Coverage shows how much of the requested weight has data.</p><p>A high score is a match across selected factors, not a probability or proof of suitability. Thermal scores rank Mars thermal inertia and Earth’s apparent proxy (1 − albedo) / annual day–night surface-temperature difference within each planet’s supplied catalog. These quantities are not physically equivalent.</p><a className="research-method-link" href="https://doi.org/10.2307/2528823" target="_blank" rel="noreferrer">Gower (1971) <span aria-hidden="true">↗</span></a></div></details>
      <details className="research-section"><summary>Data sources <span className="research-section-meta">{sources.length || 'Pending'}</span></summary><div className="research-section-body">{sources.length ? <ul className="research-source-list">{sources.map((source) => <li key={source.href || source.url}><a href={safeExternalUrl(source.href || source.url)} target="_blank" rel="noreferrer"><span className="research-source-copy"><span>{source.name || 'Dataset'}</span>{source.agency && <small>{source.agency}</small>}</span><span aria-hidden="true">↗</span></a></li>)}</ul> : <p>Site dataset links pending.</p>}<p className="comparison-muted">Partner observations and papers appear in site details when supplied.</p></div></details>
    </div>
  </div>
}
