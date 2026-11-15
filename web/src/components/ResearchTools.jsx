import { safeExternalUrl } from '../lib/comparison.js'

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
  link.download = 'mtm-benchmark-validation.csv'
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
  const sources = [...new Map(sites.flatMap((site) => site.sources || []).map((source) => [source.href || source.url, source])).values()].filter((source) => safeExternalUrl(source.href || source.url))

  return <div className="research-tools">
    <h2>Benchmarks</h2>
    <p className="comparison-muted">Known analogs used to check expected rankings. Equal weights; top five is the planned check.</p>
    <p>{report?.passed || 0} top-five checks met · {report?.pending || 0} pending</p>
    {rows.length ? <ul className="benchmark-list">{rows.map((row, index) => <li key={`${row.site.id}-${row.target?.id || index}`}><strong>{row.site.name}</strong><span>{row.target?.name || row.targetId || 'Mars pairing pending'}</span><div><span>{statusLabel[row.status] || 'Pending'}</span><span>{row.rank !== null ? `Rank ${row.rank}` : '—'}</span></div>{row.reason && <small>{row.reason}</small>}</li>)}</ul> : <p className="comparison-empty">No benchmark sites supplied yet.</p>}
    <button className="comparison-secondary-action" type="button" onClick={() => exportValidation(rows)} disabled={!rows.length}>Export validation</button>
    <details className="research-section"><summary>Analog families</summary><p className="comparison-muted">Optional grouping of sites. This does not change resemblance scores.</p>{points.length ? <><svg className="family-chart" viewBox="0 0 320 180" role="img" aria-label="Site families projected onto two principal components"><path d="M24 12v144h280" fill="none" stroke="currentColor" opacity=".25" />{points.map((point, index) => <circle key={`${point.id}-${index}`} cx={28 + x(point.pc1) * 264} cy={148 - y(point.pc2) * 128} r="4" fill="currentColor"><title>{point.name || point.id}: {point.family ?? point.cluster ?? 'Unassigned'}</title></circle>)}<text x="276" y="175">PC1</text><text x="2" y="14">PC2</text></svg><ul>{points.map((point, index) => <li key={`${point.id}-${index}`}>{point.name || point.id}: {point.family ?? point.cluster ?? 'Unassigned'}</li>)}</ul></> : <p className="comparison-empty">Analysis not connected yet.</p>}</details>
    <details className="research-section"><summary>Method & limitations</summary><p>Weighted Gower resemblance compares normalized numbers, ice categories, geology tags, and optional subsurface features.</p><p>Missing factors are excluded and the remaining weights are renormalized. Coverage shows how much of the requested weight has data.</p><p>A high score is a match across selected factors, not a probability or proof of suitability. Mars thermal inertia and Earth temperature swing are different quantities; their relative ranks need scientific review.</p><a href="https://doi.org/10.2307/2528823" target="_blank" rel="noreferrer">Gower (1971) ↗</a></details>
    <details className="research-section"><summary>Data sources</summary>{sources.length ? <ul>{sources.map((source) => <li key={source.href || source.url}><a href={safeExternalUrl(source.href || source.url)} target="_blank" rel="noreferrer">{source.name || 'Dataset'}{source.agency ? ` · ${source.agency}` : ''} ↗</a></li>)}</ul> : <p>Site dataset links pending.</p>}<p className="comparison-muted">Partner observations and research papers appear in each site's details when supplied.</p></details>
  </div>
}
