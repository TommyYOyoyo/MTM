import { useEffect, useRef } from 'react'
import { collectCredits, TEAM } from '../lib/credits.js'
import PlanetLogo from './PlanetLogo.jsx'
import './credits.css'

function Sources({ title, items }) {
  if (!items.length) return null
  return <section className="credits-section"><h2>{title}</h2><ul className="credits-source-list">{items.map((source) => <li key={source.url}>
    <a href={source.url} target="_blank" rel="noreferrer">{source.name}<span aria-hidden="true"> ↗</span></a>
    {source.agency && <p className="credits-agency">{source.agency}</p>}
    {source.detail && <p>{source.detail}</p>}
  </li>)}</ul></section>
}

export default function Credits({ sites = [], isMobile = false, onClose }) {
  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  const sources = collectCredits(sites)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    closeRef.current?.focus()
    return () => { if (dialog?.open) dialog.close() }
  }, [isMobile])

  const content = <>
    <header className="credits-header">
      {isMobile && <button ref={closeRef} className="credits-back" type="button" aria-label="Back to map" onClick={onClose}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7" /></svg><span>Back</span></button>}
      <h1 id="credits-title"><PlanetLogo size={26} />Space Out</h1>
      <span className="credits-header-label">Credits</span>
      {!isMobile && <button ref={closeRef} className="credits-close" type="button" aria-label="Close credits" onClick={onClose}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>}
    </header>
    <div className="credits-content">
      <section className="credits-creators"><h2>Created by <a href={TEAM.url} target="_blank" rel="noreferrer">{TEAM.name}</a></h2><p>NASA Space Apps 2026 · Montréal</p><ol>{TEAM.members.map((member) => <li key={member}>{member}</li>)}</ol></section>
      <Sources title="NASA data" items={sources.nasaData} />
      <Sources title="NASA imagery & science" items={sources.nasaReferences} />
      <Sources title="NASA mission & archive references" items={sources.nasaArchives} />
      <Sources title="Partner data" items={sources.partnerData} />
      <Sources title="Additional credits" items={sources.otherCredits} />
      <p className="credits-note">Location-specific research papers and coordinate sources are listed in each location’s details. Imagery is for visualization; it is not a scientific measurement.</p>
      <p className="credits-note">AI assistance: code, interface development and editing.</p>
    </div>
  </>

  return isMobile
    ? <main className="credits-page" aria-labelledby="credits-title">{content}</main>
    : <dialog ref={dialogRef} className="credits-dialog" aria-labelledby="credits-title" onCancel={(event) => { event.preventDefault(); onClose() }}>{content}</dialog>
}
