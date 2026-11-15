import { safeExternalUrl } from '../lib/comparison.js'
import './research-tools.css'

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

export default function ResearchTools({ report, families, sites }) {
  const rows = report?.rows || []
  const values = Array.isArray(families) ? families : Array.isArray(families?.points) ? families.points : []
  const points = values.filter((point) => point && Number.isFinite(point.pc1) && Number.isFinite(point.pc2))
  const extent = (key) => {
    const numbers = points.map((point) => point[key])
    const low = Math.min(...numbers)
    const high = Math.max(...numbers)
    return (value) => high === low ? 0.5 : (value - low) / (high - low)
  }
  const x = points.length ? extent('pc1') : () => 0.5
  const y = points.length ? extent('pc2') : () => 0.5
  const sources = [...new Map((sites || []).flatMap((site) => site.sources || []).map((source) => [source.href || source.url, source])).values()].filter((source) => safeExternalUrl(source.href || source.url))

  return <div className="research-tools">
    <div className="research-heading">
      <div><h2>Benchmarks</h2><p>Known analogs, equal weights.</p></div>
      <button className="comparison-secondary-action research-export" type="button" onClick={() => exportValidation(rows)} disabled={!rows.length}>Export CSV <span aria-hidden="true">↗</span></button>
    </div>
    <dl className="research-summary" aria-label="Top-five benchmark checks">
      <div><dt>Top-five checks met</dt><dd>{report?.passed || 0}</dd></div>
      <div><dt>Pending</dt><dd>{report?.pending || 0}</dd></div>
    </dl>
    {rows.length ? <ul className="benchmark-list">{rows.map((row, index) => <li className="benchmark-card" key={`${row.site.id}-${row.target?.id || index}`}>
      <div className="benchmark-copy"><strong>{row.site.name}</strong><span>{row.target?.name || row.targetId || 'Mars pairing pending'}</span></div>
      <div className="benchmark-rank"><span>Rank</span><strong>{Number.isFinite(row.rank) ? row.rank : '—'}</strong></div>
      <span className="benchmark-status" data-status={row.status}>{statusLabel[row.status] || 'Pending'}</span>
      {row.reason && <small className="benchmark-reason">{row.reason}</small>}
    </li>)}</ul> : <p className="comparison-empty">No benchmark sites supplied yet.</p>}
    <div className="research-disclosures">
      <details className="research-section"><summary>Analog families <span className="research-section-meta">{points.length ? `${points.length} sites` : 'Optional'}</span></summary><div className="research-section-body"><p>Optional site groupings. Resemblance scores are unchanged.</p>{points.length ? <><svg className="family-chart" viewBox="0 0 320 180" role="img" aria-label="Site families projected onto two principal components"><path d="M24 12v144h280" fill="none" stroke="currentColor" opacity=".25" />{points.map((point, index) => <circle key={`${point.id}-${index}`} cx={28 + x(point.pc1) * 264} cy={148 - y(point.pc2) * 128} r="4" fill="currentColor"><title>{point.name || point.id}: {point.family ?? point.cluster ?? 'Unassigned'}</title></circle>)}<text x="276" y="175">PC1</text><text x="2" y="14">PC2</text></svg><ul className="research-family-list">{points.map((point, index) => <li key={`${point.id}-${index}`}><span>{point.name || point.id}</span><span>{point.family ?? point.cluster ?? 'Unassigned'}</span></li>)}</ul></> : <p className="comparison-empty">Analysis not connected yet.</p>}</div></details>
      <details className="research-section"><summary>Method & limitations</summary><div className="research-section-body"><p>Weighted Gower resemblance compares normalized numbers, ice categories, geology tags, and optional subsurface features.</p><p>Missing factors are excluded and the remaining weights are renormalized. Coverage shows how much of the requested weight has data.</p><p>A high score is a match across selected factors, not a probability or proof of suitability. Thermal scores rank Mars thermal inertia and Earth’s apparent proxy (1 − albedo) / annual day–night surface-temperature difference within each planet’s supplied catalog. These quantities are not physically equivalent.</p><a className="research-method-link" href="https://doi.org/10.2307/2528823" target="_blank" rel="noreferrer">Gower (1971) <span aria-hidden="true">↗</span></a></div></details>
      <details className="research-section"><summary>Data sources <span className="research-section-meta">{sources.length || 'Pending'}</span></summary><div className="research-section-body">{sources.length ? <ul className="research-source-list">{sources.map((source) => <li key={source.href || source.url}><a href={safeExternalUrl(source.href || source.url)} target="_blank" rel="noreferrer"><span className="research-source-copy"><span>{source.name || 'Dataset'}</span>{source.agency && <small>{source.agency}</small>}</span><span aria-hidden="true">↗</span></a></li>)}</ul> : <p>Site dataset links pending.</p>}<p className="comparison-muted">Partner observations and papers appear in site details when supplied.</p></div></details>
    </div>
  </div>
}
