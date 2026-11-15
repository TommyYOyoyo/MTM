import { useEffect, useRef, useState } from 'react'
import ComparisonControls from './ComparisonControls.jsx'
import { normalizeWeights, WEIGHT_PRESETS } from '../lib/comparison.js'
import './mobile-comparison.css'

export default function MobileComparisonPage({ settings, sites, placeholder, disabled, onBack, onDone }) {
  const [draft, setDraft] = useState(() => ({ ...settings, weights: { ...settings.weights } }))
  const backRef = useRef(null)
  const targetPlanet = draft.mode === 'mars-to-earth' ? 'mars' : 'earth'
  const targets = sites.filter((site) => site.planet === targetPlanet
    && (targetPlanet !== 'mars' || draft.elevationLimit === null
      || Number.isFinite(site.elevation_m) && site.elevation_m <= draft.elevationLimit))

  useEffect(() => { backRef.current?.focus() }, [])

  function changeElevation(value) {
    setDraft((current) => {
      const target = sites.find((site) => site.id === current.targetId)
      const excludeTarget = target?.planet === 'mars' && value !== null
        && (!Number.isFinite(target.elevation_m) || target.elevation_m > value)
      return { ...current, elevationLimit: value, targetId: excludeTarget ? '' : current.targetId }
    })
  }

  return (
    <section className="mobile-comparison-page" aria-labelledby="mobile-comparison-title">
      <header className="mobile-comparison-header">
        <button ref={backRef} className="mobile-comparison-back" type="button" onClick={onBack} aria-label="Back to map">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5-7 7 7 7" /></svg><span>Back</span>
        </button>
        <h1 id="mobile-comparison-title">Compare</h1>
        <button className="mobile-comparison-done" type="button" disabled={disabled} onClick={() => onDone(draft)}>Done</button>
      </header>
      <div className="mobile-comparison-body">
        <ComparisonControls
          presentation="page"
          mode={draft.mode}
          targetId={draft.targetId}
          onTargetChange={(targetId) => setDraft((current) => ({ ...current, targetId }))}
          targets={targets}
          weights={draft.weights}
          onWeightsChange={(weights) => setDraft((current) => ({ ...current, weights, presetId: 'custom' }))}
          presetId={draft.presetId}
          onPresetChange={(presetId) => {
            const preset = WEIGHT_PRESETS.find((item) => item.id === presetId)
            if (preset) setDraft((current) => ({ ...current, presetId, weights: normalizeWeights(preset.weights) }))
          }}
          elevationLimit={draft.elevationLimit}
          onElevationLimitChange={changeElevation}
          disabled={disabled}
          placeholder={placeholder}
        />
      </div>
    </section>
  )
}
