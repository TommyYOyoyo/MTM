import { CHARACTERISTICS, DEFAULT_CHARACTERISTICS } from './explorerMatching'

export default function CharacteristicsPanel({ values, ice, geology, tags, onChange, onIceChange, onGeologyChange, onReset }) {
  return <div className="mtm-characteristics">
    <p className="mtm-eyebrow">01 / Define your analog</p>
    <h2>Find familiar ground.</h2>
    <p className="mtm-note">Choose the surface characteristics you want. Sites are ranked by how closely they match.</p>
    <div className="mtm-sliders">{CHARACTERISTICS.map(({ key, label, low, high, hint }) => <div className="mtm-slider-field" key={key}>
      <div className="mtm-slider-heading"><label htmlFor={`characteristic-${key}`}>{label}</label><output htmlFor={`characteristic-${key}`}>{values[key].toFixed(2)}</output></div>
      <input id={`characteristic-${key}`} type="range" min="0" max="1" step="0.01" value={values[key]} aria-describedby={`hint-${key}`} onChange={event => onChange(key, Number(event.target.value))} style={{ '--slider-progress': `${values[key] * 100}%` }} />
      <div className="mtm-slider-scale"><span>{low}</span><span>{high}</span></div>
      <p className="mtm-note" id={`hint-${key}`}>{hint}</p>
    </div>)}</div>
    <label className="mtm-field-label" htmlFor="analog-ice">Ice preference</label>
    <select id="analog-ice" value={ice} onChange={event => onIceChange(event.target.value)}><option value="">Any / not scored</option><option value="none">No ice</option><option value="permafrost">Permafrost</option><option value="ground_ice">Ground ice</option><option value="glacier">Glacier</option></select>
    <label className="mtm-field-label" htmlFor="analog-geology">Geology preference</label>
    <select id="analog-geology" value={geology} onChange={event => onGeologyChange(event.target.value)}><option value="">Any / not scored</option>{tags.map(tag => <option key={tag} value={tag}>{tag.replaceAll('_', ' ')}</option>)}</select>
    <button className="mtm-button mtm-reset" type="button" onClick={() => onReset({ ...DEFAULT_CHARACTERISTICS })}>Reset characteristics</button>
    <p className="mtm-note">Equal factor weights. Missing measurements are skipped, never treated as zero. These sliders set desired values, not importance weights.</p>
  </div>
}
