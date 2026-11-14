import './layout.css'

export default function LimitsPanel({ limits = [] }) {
  return <section className="mtm-limits" aria-label="Limits of Earth analogs">
    <p className="mtm-eyebrow">Where the analogy stops</p>
    <h3>Earth is not Mars.</h3>
    <p>A resemblance score compares selected surface properties. It is not a habitability or landing-safety rating.</p>
    <dl className="mtm-limits-grid">
      <div><dt>Gravity</dt><dd>≈ 0.38 Earth g</dd></div>
      <div><dt>Surface pressure</dt><dd>Less than 1% of Earth’s on average</dd></div>
      <div><dt>Liquid water</dt><dd>Not stable for long at the surface</dd></div>
      <div><dt>Radiation / UV</dt><dd>Much less atmospheric shielding</dd></div>
    </dl>
    {limits.length > 0 && <ul>{limits.map((limit, i) => <li key={i}>{limit}</li>)}</ul>}
    <p className="mtm-note">Thermal comparisons use within-planet percentiles: Mars thermal inertia and Earth day–night temperature swings are different measurements.</p>
    <p className="mtm-source-links"><a href="https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html" target="_blank" rel="noopener noreferrer">NASA Mars Fact Sheet ↗</a><a href="https://science.nasa.gov/mars/facts/" target="_blank" rel="noopener noreferrer">NASA Mars Facts ↗</a><a href="https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/mars/" target="_blank" rel="noopener noreferrer">NASA radiation context ↗</a></p>
  </section>
}
