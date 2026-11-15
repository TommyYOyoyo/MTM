import { useId } from 'react'
import { FACTOR_INFO, WEIGHT_PRESETS, setFactorWeight } from '../lib/comparison.js'
import './comparison-controls.css'

export default function ComparisonControls({
  mode = 'mars-to-earth', targetId = '', onTargetChange,
  targets = [], weights = {}, onWeightsChange, presetId = 'equal', onPresetChange,
  elevationLimit = null, onElevationLimitChange, disabled = false, placeholder = false,
  presentation = 'panel',
  onOpenDual,
}) {
  const id = useId()
  const activePreset = WEIGHT_PRESETS.some((preset) => preset.id === presetId) ? presetId : 'custom'
  const equalPreset = WEIGHT_PRESETS.find((preset) => preset.id === 'equal' || /equal/i.test(preset.label)) || WEIGHT_PRESETS[0]
  const total = FACTOR_INFO.reduce((sum, factor) => sum + (Number(weights[factor.key]) || 0), 0)
  const hasTargets = targets.length > 0
  const isPage = presentation === 'page'
  const Container = isPage ? 'section' : 'details'

  return (
    <Container className={`comparison-controls${isPage ? ' comparison-controls-page' : ''}`} aria-label={isPage ? 'Comparison settings' : undefined}>
      {!isPage && <summary className="comparison-controls-summary">
        <span>Compare</span>
        <span className="comparison-controls-summary-meta">{placeholder ? 'Sample data' : mode === 'earth-to-mars' ? 'Earth → Mars' : 'Mars → Earth'}</span>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
      </summary>}
      <div className="comparison-controls-content">
        <fieldset className="comparison-controls-fields" disabled={disabled}>
          <legend className="comparison-sr-only">Comparison settings</legend>
          {!isPage && onOpenDual && <button type="button" className="comparison-dual-action" onClick={onOpenDual}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M12 5v14" /></svg><span>Dual comparison</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></button>}
          <div className="comparison-direction">
            <span>Direction</span>
            <span>{mode === 'earth-to-mars' ? 'Earth → Mars' : 'Mars → Earth'}</span>
          </div>
          <label className="comparison-field" htmlFor={`${id}-target`}>
            <span>Target</span>
            <select id={`${id}-target`} value={targetId || ''} disabled={!hasTargets} onChange={(event) => onTargetChange?.(event.target.value)}>
              <option value="">{hasTargets ? 'Choose a location' : 'No locations available'}</option>
              {targets.map((site) => <option key={site.id} value={site.id}>{site.name || site.id}</option>)}
            </select>
          </label>
          <label className="comparison-field" htmlFor={`${id}-preset`}>
            <span>Preset</span>
            <select id={`${id}-preset`} value={activePreset} onChange={(event) => onPresetChange?.(event.target.value)}>
              {activePreset === 'custom' && <option value="custom">Custom</option>}
              {WEIGHT_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
            </select>
          </label>
          <div className="comparison-weights-heading">
            <span>Weights <span className="comparison-weights-total" aria-label={`Total weight ${Math.round(total)} percent`}>{Math.round(total)}%</span></span>
            <button type="button" className="comparison-text-button" onClick={() => equalPreset && onPresetChange?.(equalPreset.id)}>Equal reset</button>
          </div>
          <div className="comparison-weight-list">
            {FACTOR_INFO.map((factor) => {
              const value = Number(weights[factor.key]) || 0
              return (
                <div className="comparison-weight" key={factor.key}>
                  <div className="comparison-weight-label"><label htmlFor={`${id}-${factor.key}`}>{factor.label}</label><output htmlFor={`${id}-${factor.key}`}>{Number(value.toFixed(1))}%</output></div>
                  <input id={`${id}-${factor.key}`} type="range" min="0" max="100" step="1" value={value} aria-label={`${factor.label} weight`} aria-valuetext={`${value} percent`} onChange={(event) => onWeightsChange?.(setFactorWeight(weights, factor.key, Number(event.target.value)))} />
                </div>
              )
            })}
          </div>
          <label className="comparison-field comparison-elevation" htmlFor={`${id}-elevation`}>
            <span>Mars maximum elevation <span className="comparison-field-unit">m</span></span>
            <input id={`${id}-elevation`} type="number" step="100" value={elevationLimit ?? ''} placeholder="None" onChange={(event) => onElevationLimitChange?.(event.target.value === '' ? null : Number(event.target.value))} />
          </label>
          {elevationLimit !== null && elevationLimit !== '' && <button type="button" className="comparison-text-button comparison-clear-elevation" onClick={() => onElevationLimitChange?.(null)}>Clear elevation limit</button>}
        </fieldset>
      </div>
    </Container>
  )
}

export { ComparisonControls }
