import { useEffect, useMemo, useState } from 'react'
import Layout from './Layout'
import DetailPanel from './DetailPanel'
import CharacteristicsPanel from './CharacteristicsPanel'
import PlanetExplorer from './PlanetExplorer'
import { DEFAULT_CHARACTERISTICS, matchCharacteristics } from './explorerMatching'
import './explorer.css'

export default function AnalogExplorer() {
  const [sites, setSites] = useState([])
  const [status, setStatus] = useState('loading')
  const [planet, setPlanet] = useState('mars')
  const [values, setValues] = useState({ ...DEFAULT_CHARACTERISTICS })
  const [ice, setIce] = useState('')
  const [geology, setGeology] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/sites.json', { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error('Site data unavailable')
      return response.json()
    }).then(data => {
      if (!Array.isArray(data)) throw new Error('Site data must be an array')
      setSites(data.filter(site => site && typeof site.id === 'string' && typeof site.name === 'string' && ['mars', 'earth'].includes(site.planet)))
      setStatus('ready')
    }).catch(error => { if (error.name !== 'AbortError') setStatus('error') })
    return () => controller.abort()
  }, [retry])

  const target = useMemo(() => ({ name: 'Your characteristics', n: values, ice: ice || null, tags: geology ? [geology] : [] }), [values, ice, geology])
  const results = useMemo(() => sites.filter(site => site.planet === planet).map(site => matchCharacteristics(site, target)).sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.site.name.localeCompare(b.site.name)), [sites, planet, target])
  const selected = results.find(result => result.site.id === selectedId) ?? results[0]
  const tags = [...new Set(sites.flatMap(site => site.tags ?? []))].sort()
  const sample = sites.some(site => /^FAKE\b/i.test(site.name))

  return <Layout planet={planet} onPlanetChange={value => { setPlanet(value); setSelectedId(null) }}
    left={<CharacteristicsPanel values={values} ice={ice} geology={geology} tags={tags} onChange={(key, value) => setValues(previous => ({ ...previous, [key]: value }))} onIceChange={setIce} onGeologyChange={setGeology} onReset={defaults => { setValues(defaults); setIce(''); setGeology('') }} />}
    centre={<>{sample && <p className="mtm-sample">Demo dataset · all scores and site measurements are illustrative</p>}
      {status === 'loading' ? <p role="status" className="mtm-empty">Loading sites…</p> : status === 'error' ? <div role="alert" className="mtm-empty"><p>Could not load site data.</p><button className="mtm-button" onClick={() => { setStatus('loading'); setRetry(value => value + 1) }}>Try again</button></div> : <>
        <PlanetExplorer planet={planet} sites={results.map(result => result.site)} selectedId={selected?.site.id} onSelect={setSelectedId} />
        <section className="mtm-results" aria-label="Matching sites"><div className="mtm-results-heading"><h3>Closest matches</h3><span aria-live="polite">{results.length} sites</span></div><p className="mtm-note">Choose a marker or a result to inspect its details.</p>
          {results.length ? <ol>{results.map((result, index) => <li key={result.site.id}><button className="mtm-result" aria-pressed={selected?.site.id === result.site.id} onClick={() => setSelectedId(result.site.id)}><span className="mtm-result-rank">{String(index + 1).padStart(2, '0')}</span><span className="mtm-result-name">{result.site.name.replace(/^FAKE\s*/, '')}<small>{result.compared}/{result.requested} factors available{sample ? ' · sample' : ''}</small></span><strong>{result.score === null ? '—' : `${result.score.toFixed(1)}%`}</strong></button></li>)}</ol> : <p className="mtm-empty">No sites are available for this planet.</p>}
        </section>
      </>}
    </>}
    right={<><p className="mtm-eyebrow">03 / Selected site</p><DetailPanel site={selected?.site} target={target} result={selected} loading={status === 'loading'} /></>}
  />
}
