import { useId, useState } from 'react'
import './layout.css'

export default function Layout({ left, centre, right, loading = false, planet = 'mars', onPlanetChange }) {
  const id = useId()
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  return <div className="mtm-layout">
    <a className="mtm-skip" href={`#${id}`}>Skip to exploration</a>
    <header className="mtm-header">
      <div className="mtm-brand"><span className="mtm-mark" aria-hidden="true">M</span><div><strong>MAP THE MARS</strong><p>Find familiar ground on another world.</p></div></div>
      <div className="mtm-destinations" aria-label="Destinations">{onPlanetChange ? <>{['mars', 'earth'].map(value => <button key={value} className="mtm-planet-button" aria-pressed={planet === value} onClick={() => onPlanetChange(value)}>{value === 'mars' ? 'Mars' : 'Earth'}</button>)}</> : <span className="mtm-badge">Mars · active</span>}<button disabled>Moon · coming soon</button></div>
    </header>
    <div className="mtm-panel-toolbar" aria-label="Panel visibility">
      <button className="mtm-panel-toggle" aria-expanded={leftOpen} aria-controls={`${id}-left`} onClick={() => setLeftOpen(open => !open)}>{leftOpen ? '‹ Hide characteristics' : '› Show characteristics'}</button>
      <button className="mtm-panel-toggle" aria-expanded={rightOpen} aria-controls={`${id}-right`} onClick={() => setRightOpen(open => !open)}>{rightOpen ? 'Hide site details ›' : 'Show site details ‹'}</button>
    </div>
    <main id={id} tabIndex={-1} className={`mtm-columns${leftOpen ? '' : ' mtm-left-hidden'}${rightOpen ? '' : ' mtm-right-hidden'}`} aria-busy={loading}>
      <aside id={`${id}-left`} hidden={!leftOpen} className="mtm-column mtm-controls" aria-label="Search and weights">{left ?? <p className="mtm-empty">Search controls will appear here.</p>}</aside>
      <section className="mtm-column mtm-exploration" aria-label="Explore sites">{loading ? <p className="mtm-empty" role="status">Loading sites…</p> : centre ?? <p className="mtm-empty">Choose a target to explore its Earth analogs.</p>}</section>
      <aside id={`${id}-right`} hidden={!rightOpen} className="mtm-column mtm-details" aria-label="Selected site details">{right ?? <p className="mtm-empty">Select a result to compare the details.</p>}</aside>
    </main>
    <footer className="mtm-footer">Earth analogs reveal similarities, not identical environments.</footer>
  </div>
}
