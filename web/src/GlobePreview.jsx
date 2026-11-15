import { useEffect, useState } from 'react'
import Globe from './components/Globe.jsx'
import './globe-preview.css'

function validSite(site, planet) {
  return site?.planet === planet
    && Number.isFinite(site.lat) && site.lat >= -90 && site.lat <= 90
    && Number.isFinite(site.lon) && site.lon >= -180 && site.lon <= 180
}

function safeLink(url) {
  try {
    const parsed = new URL(url)
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null
  } catch {
    return null
  }
}

export default function GlobePreview() {
  const [sites, setSites] = useState([])
  const [planet, setPlanet] = useState('mars')
  const [selectedId, setSelectedId] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [listCollapsed, setListCollapsed] = useState(false)
  const [detailsCollapsed, setDetailsCollapsed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${import.meta.env.BASE_URL}sites.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Request failed (${response.status})`)
        return response.json()
      })
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('Site data must be an array')
        setSites(data)
        setSelectedId(data.find((site) => validSite(site, 'mars'))?.id ?? null)
      })
      .catch((problem) => {
        if (problem.name !== 'AbortError') setError(problem.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  const planetSites = sites.filter((site) => validSite(site, planet))
  const searchTerm = search.trim().toLocaleLowerCase()
  const searchResults = searchTerm
    ? planetSites.filter((site) => String(site.name || site.id).toLocaleLowerCase().includes(searchTerm))
    : []
  const selected = planetSites.find((site) => site.id === selectedId)
  const sources = Array.isArray(selected?.sources)
    ? selected.sources.map((source) => ({ ...source, href: safeLink(source.url) })).filter((source) => source.href)
    : []
  const factors = [
    ['Slope', selected?.n?.slope],
    ['Albedo', selected?.n?.albedo],
    ['Thermal', selected?.n?.thermal],
  ]

  function selectPlanet(nextPlanet) {
    if (nextPlanet === planet) return
    setPlanet(nextPlanet)
    setSearch('')
    setSelectedId(sites.find((site) => validSite(site, nextPlanet))?.id ?? null)
  }

  return (
    <div className="preview-shell">
      <main className="preview-map" aria-label="Planet explorer">
        {!loading && !error && <Globe sites={sites} planet={planet} selectedId={selectedId} onSelect={setSelectedId} showSiteList={false} fill />}
        {loading && <p className="preview-message" role="status">Loading locations…</p>}
        {error && <p className="preview-message preview-error" role="alert">Unable to load locations: {error}</p>}
      </main>
      <footer className="preview-beta"><span>Beta</span><span>© MTM 2026</span></footer>
      <div className="preview-chrome">
        {!loading && !error && (
          <div className="preview-search">
            <input className="preview-search-input" type="search" aria-label="Search locations" placeholder="Search locations" value={search} onChange={(event) => setSearch(event.target.value)} />
            {searchTerm && (
              <div className="preview-search-results">
                {searchResults.length ? searchResults.map((site) => (
                  <button className="preview-search-result" type="button" key={site.id} onClick={() => { setSelectedId(site.id); setSearch('') }}>
                    {site.name || site.id}
                  </button>
                )) : <p className="preview-search-empty">No locations found</p>}
              </div>
            )}
          </div>
        )}
        <div className="preview-switch" data-planet={planet} role="group" aria-label="Choose a planet">
          {['earth', 'mars'].map((choice) => (
            <button key={choice} type="button" aria-pressed={planet === choice} onClick={() => selectPlanet(choice)}>
              {choice === 'mars' ? 'Mars' : 'Earth'}
            </button>
          ))}
        </div>
        {!loading && !error && (
          <>
            <aside className={`preview-list${listCollapsed ? ' is-collapsed' : ''}`} aria-label="Sample locations" hidden={Boolean(searchTerm)}>
              <div className="preview-panel-heading">
                <span className="preview-panel-title">LOCATIONS ({planetSites.length})</span>
                <button className="preview-panel-toggle" type="button" aria-label={listCollapsed ? 'Expand locations' : 'Collapse locations'} aria-expanded={!listCollapsed} aria-controls="preview-list-content" onClick={() => setListCollapsed(!listCollapsed)}>{listCollapsed ? '⌄' : '⌃'}</button>
              </div>
              <div id="preview-list-content" hidden={listCollapsed}>
              {planetSites.length ? (
                <ol className="preview-site-list">
                  {planetSites.map((site, index) => (
                    <li key={site.id}>
                      <button className="preview-site-button" type="button" aria-pressed={site.id === selectedId} onClick={() => setSelectedId(site.id)}>
                        <span className="preview-site-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                        <span className="preview-site-name">{site.name || site.id}</span>
                        <span className="preview-site-chevron" aria-hidden="true">›</span>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : <p className="preview-empty">No locations available.</p>}
              </div>
            </aside>
            <aside className={`preview-sidebar${detailsCollapsed ? ' is-collapsed' : ''}`} aria-label="Selected location">
              <div className="preview-panel-heading">
                <span className="preview-panel-title">LOCATION</span>
                <button className="preview-panel-toggle" type="button" aria-label={detailsCollapsed ? 'Expand location details' : 'Collapse location details'} aria-expanded={!detailsCollapsed} aria-controls="preview-details-content" onClick={() => setDetailsCollapsed(!detailsCollapsed)}>{detailsCollapsed ? '⌄' : '⌃'}</button>
              </div>
              <div id="preview-details-content" hidden={detailsCollapsed}>
                <div aria-live="polite">
              {selected ? (
                <div className="preview-selection">
                  <h1>{selected.name || selected.id}</h1>
                  <p className="preview-selection-meta">Test location</p>
                  <dl className="preview-coordinates">
                    <div><dt>Similarity</dt><dd>Not calculated</dd></div>
                    <div><dt>Latitude</dt><dd>{selected.lat.toFixed(2)}°</dd></div>
                    <div><dt>Longitude</dt><dd>{selected.lon.toFixed(2)}°</dd></div>
                  </dl>
                  <div className="preview-factors">
                    <p className="preview-sidebar-label">SAMPLE VALUES · NORMALIZED</p>
                    <dl className="preview-coordinates">
                      {factors.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{Number.isFinite(value) ? value.toFixed(2) : 'Missing'}</dd></div>)}
                    </dl>
                  </div>
                  <div className="preview-sources">
                    <p className="preview-sidebar-label">SOURCES</p>
                    {sources.length ? <ul className="preview-source-list">{sources.map((source) => <li key={source.href}><a href={source.href} target="_blank" rel="noreferrer">{source.name || 'Source'} ↗</a></li>)}</ul> : <p className="preview-selection-meta">No sources provided</p>}
                  </div>
                </div>
              ) : <div className="preview-empty"><h1>Choose a location</h1></div>}
                </div>
              </div>
            </aside>
          </>
        )}
      </div>
    </div>
  )
}
