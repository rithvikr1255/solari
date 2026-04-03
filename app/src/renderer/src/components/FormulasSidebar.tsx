import { useState, useSyncExternalStore } from 'react'
import { runEquationCatalogScan } from '../equationCatalogApi'
import { insertEquationAtCursor } from '../equationInsert'
import {
  getReferenceSnapshot,
  getReferenceText,
  subscribe,
  type EquationEntry
} from '../referenceContext'
import KatexPreview from './KatexPreview'

export default function FormulasSidebar() {
  const refState = useSyncExternalStore(subscribe, getReferenceSnapshot, getReferenceSnapshot)
  const equations = refState.equations
  const [rescanning, setRescanning] = useState(false)
  const [open, setOpen] = useState(false)
  const hasRef = refState.text.trim().length > 0

  async function rescan() {
    const text = getReferenceText()
    if (!text.trim() || rescanning) return
    setRescanning(true)
    try {
      await runEquationCatalogScan(text)
    } finally {
      setRescanning(false)
    }
  }

  return (
    <div className={`formula-dock${open ? ' formula-dock-open' : ''}`}>
      <div
        id="formula-drawer"
        className="side-panel-drawer"
        aria-hidden={!open}
        role="region"
        aria-labelledby="formula-dock-tab"
      >
        <aside className="side-panel">
          <div className="side-panel-header">
            <span className="side-panel-title">
              Formulas{equations.length > 0 ? ` (${equations.length})` : ''}
            </span>
            <button
              type="button"
              className="side-panel-close"
              onClick={() => setOpen(false)}
              aria-label="Hide formulas panel"
            >
              ×
            </button>
          </div>
          <div className="side-panel-body" role="tabpanel">
        {hasRef ? (
          <div className="side-panel-rescan">
            <button
              type="button"
              className="titlebar-btn formula-rescan-btn"
              disabled={rescanning}
              onClick={() => void rescan()}
            >
              {rescanning ? 'Scanning…' : 'Rescan formulas'}
            </button>
          </div>
        ) : null}
        {equations.length === 0 ? (
          <div className="side-panel-empty-block">
            <p className="side-panel-empty">
              {refState.text.trim()
                ? 'No formulas are listed yet for this reference.'
                : 'Attach a reference PDF or PPTX to list equations found in the slides.'}
            </p>
            {refState.formulaHint ? (
              <p className="side-panel-hint">{refState.formulaHint}</p>
            ) : null}
          </div>
        ) : (
          <ul className="formula-list">
            {equations.map((e: EquationEntry, i: number) => (
              <li key={`${e.id}-${i}`} className="formula-item">
                <div className="formula-item-label">{e.label}</div>
                <div className="formula-item-preview">
                  <KatexPreview latex={e.latex} display={e.display} />
                </div>
                <pre className="formula-item-latex">{e.latex}</pre>
                {e.triggers.length > 0 ? (
                  <div className="formula-item-triggers">
                    {e.triggers.slice(0, 6).join(' · ')}
                    {e.triggers.length > 6 ? ' …' : ''}
                  </div>
                ) : null}
                <div className="formula-item-actions">
                  <button
                    type="button"
                    className="titlebar-btn formula-insert-btn"
                    onClick={() => insertEquationAtCursor(e.latex, false)}
                  >
                    Inline
                  </button>
                  <button
                    type="button"
                    className="titlebar-btn formula-insert-btn"
                    onClick={() => insertEquationAtCursor(e.latex, true)}
                  >
                    Display
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
          </div>
        </aside>
      </div>
      <button
        type="button"
        className={`formula-dock-tab${open ? ' formula-dock-tab-active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="formula-drawer"
        id="formula-dock-tab"
      >
        {equations.length > 0 ? (
          <span className="formula-dock-badge" aria-hidden="true">
            {equations.length}
          </span>
        ) : null}
        <span className="formula-dock-tab-text">Formulas</span>
      </button>
    </div>
  )
}
