import { useId } from 'react'
import { BarChart, Bar, Cell, XAxis, YAxis, ResponsiveContainer } from 'recharts'
import LimitsPanel from './LimitsPanel'
import './layout.css'

const names = { slope: 'Slope', albedo: 'Albedo', thermal: 'Thermal', sun: 'Sun', ice: 'Ice', geology: 'Geology', subsurface: 'Subsurface' }
const finite = value => typeof value === 'number' && Number.isFinite(value)
const unitValue = value => finite(value) && value >= 0 && value <= 1
const humanize = value => typeof value === 'string' ? value.replaceAll('_', ' ') : 'Missing data'
function safeUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null } catch { return null }
}
function Reference({ url, children }) {
  const href = safeUrl(url)
  return href ? <a href={href} target="_blank" rel="noopener noreferrer">{children} ↗</a> : <span>{children} <small>(link unavailable)</small></span>
}
function Notes({ title, items, empty, tone }) {
  return <section className={`mtm-notes ${tone}`}><h3>{title}</h3>{items?.length ? <ul>{items.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p className="mtm-muted">{empty}</p>}</section>
}
function valueFor(site, factor) {
  if (!site) return 'Missing data'
  if (factor === 'geology') return site.tags?.length ? site.tags.join(', ') : 'Missing data'
  if (factor === 'ice' || factor === 'subsurface') return humanize(site[factor])
  return unitValue(site.n?.[factor]) ? `${site.n[factor].toFixed(3)} / 1` : 'Missing data'
}

export default function DetailPanel({ site, target, result, loading = false }) {
  const id = useId()
  if (loading) return <section className="mtm-detail mtm-empty" role="status">Loading site details…</section>
  if (!site) return <section className="mtm-detail mtm-empty"><p className="mtm-eyebrow">A closer look</p><h2>Select a site</h2><p>Choose a result to see its resemblance, differences and evidence.</p></section>
  const parts = Array.isArray(result?.parts) ? result.parts : []
  const rows = Object.keys(names).map(factor => {
    const part = parts.find(p => p.factor === factor)
    const valid = unitValue(part?.sim)
    return { factor, label: names[factor], similarity: valid ? part.sim * 100 : null, excluded: part?.weight === 0 }
  })
  const bars = rows.filter(row => row.similarity !== null)
  const score = finite(result?.score) && result.score >= 0 && result.score <= 100 ? result.score : null
  const sample = /^FAKE\b/i.test(site.name) || /^FAKE\b/i.test(target?.name ?? '')
  return <article className="mtm-detail" aria-labelledby={id}>
    {sample && <p className="mtm-sample">Sample data · not scientific results</p>}
    <p className="mtm-eyebrow">{site.planet === 'mars' ? 'Mars site' : 'Earth analog'}{site.benchmark ? ' · benchmark' : ''}</p>
    <h2 id={id}>{site.name}</h2>
    <p className="mtm-coordinates">{finite(site.lat) && finite(site.lon) ? `${site.lat.toFixed(2)}° latitude · ${site.lon.toFixed(2)}° longitude` : 'Coordinates: missing data'}</p>
    <div className="mtm-score"><strong>{score === null ? '—' : `${score.toFixed(1)}%`}</strong><div>Resemblance<p>{target ? `Compared with ${target.name}` : 'Choose a target to compare'}</p></div></div>
    {score === null && <p className="mtm-note">No comparison score available.</p>}
    <section><h3>Factor resemblance</h3><p className="mtm-note">Green ≥ 70% similarity; red &lt; 70%. This is a display guide, not a scientific cutoff. Text values are provided below.</p>
      {bars.length > 0 ? <div className="mtm-chart" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><BarChart data={bars} layout="vertical" margin={{ left: 0, right: 15, top: 5, bottom: 5 }} accessibilityLayer={false}><XAxis type="number" domain={[0, 100]} tick={{ fill: 'var(--mtm-almond-muted)', fontSize: 11 }} tickFormatter={v => `${v}%`} /><YAxis type="category" dataKey="label" width={83} tick={{ fill: 'var(--mtm-almond)', fontSize: 12 }} tickLine={false} axisLine={false} /><Bar dataKey="similarity" barSize={12} radius={[0, 3, 3, 0]} isAnimationActive={false}>{bars.map(row => <Cell key={row.factor} fill={row.excluded ? 'var(--mtm-almond-muted)' : row.similarity >= 70 ? '#7bd9ae' : '#f28f80'} />)}</Bar></BarChart></ResponsiveContainer></div> : <p className="mtm-empty">Factor comparisons are not available yet.</p>}
      <ul className="mtm-factor-list">{rows.map(row => <li key={row.factor}><span>{row.label}</span><span>{row.similarity === null ? 'Missing data / not compared' : `${row.similarity.toFixed(1)}% ${row.similarity >= 70 ? 'match' : 'break'}`}{row.excluded ? ' · not weighted' : ''}</span></li>)}</ul>
    </section>
    <section><h3>Values at a glance</h3><p className="mtm-note">Numeric factors are normalized to 0–1, not raw physical units. Thermal is a within-planet percentile.</p><div className="mtm-table-wrap"><table><caption className="mtm-sr-only">Selected and target site values</caption><thead><tr><th scope="col">Factor</th><th scope="col">Selected site</th><th scope="col">Target</th></tr></thead><tbody>{rows.map(row => <tr key={row.factor}><th scope="row">{row.label}</th><td>{valueFor(site, row.factor)}</td><td>{valueFor(target, row.factor)}</td></tr>)}</tbody></table></div></section>
    {site.planet === 'mars' && <div className="mtm-elevation"><strong>Mars elevation</strong><p>{finite(site.elevation_m) ? `${site.elevation_m.toLocaleString()} m` : 'Missing data'}</p><small>Landing filter only · not included in the score</small></div>}
    <Notes title="Where it matches" items={site.pros} empty="No researched matches supplied yet." tone="mtm-match" />
    <Notes title="Where it breaks" items={site.cons} empty="No researched differences supplied yet." tone="mtm-break" />
    <LimitsPanel limits={Array.isArray(site.limits) ? site.limits : []} />
    <section><h3>Sources</h3>{site.sources?.length ? <ul className="mtm-references">{site.sources.map((source, i) => <li key={i}><Reference url={source.url}>{source.name}{source.agency ? ` · ${source.agency}` : ''}</Reference></li>)}</ul> : <p className="mtm-muted">No data sources supplied yet.</p>}</section>
    <section><h3>Papers</h3>{site.papers?.length ? <ul className="mtm-references">{site.papers.map((paper, i) => <li key={i}><Reference url={paper.doi ? `https://doi.org/${paper.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')}` : paper.url}>{paper.title || paper.doi || 'Untitled paper'}</Reference></li>)}</ul> : <p className="mtm-muted">No papers supplied yet.</p>}</section>
    {site.links?.length > 0 && <section><h3>Explore further</h3><ul className="mtm-references">{site.links.map((link, i) => <li key={i}><Reference url={link.url}>{link.label || 'Site reference'}</Reference></li>)}</ul></section>}
  </article>
}
