import { useEffect, useState } from 'react'
import { insertEquationAtCursor } from '../equationInsert'
import { acceptEquationSuggestion, dismissEquationSuggestion } from '../extensions/equationSuggest'

type Detail = { id: string; latex: string; label: string; display: boolean }

export default function EquationPrompt() {
  const [s, setS] = useState<Detail | null>(null)

  useEffect(() => {
    function onEv(e: Event) {
      const ce = e as CustomEvent<Detail>
      if (ce.detail?.latex) setS(ce.detail)
    }
    window.addEventListener('solari-equation-suggest', onEv)
    return () => window.removeEventListener('solari-equation-suggest', onEv)
  }, [])

  if (!s) return null

  function insert() {
    acceptEquationSuggestion(s.id)
    insertEquationAtCursor(s.latex, s.display)
    setS(null)
  }

  function dismiss() {
    dismissEquationSuggestion(s.id)
    setS(null)
  }

  return (
    <div className="equation-prompt" role="dialog" aria-label="Equation suggestion">
      <div className="equation-prompt-inner">
        <span className="equation-prompt-label">From slides: {s.label}</span>
        <code className="equation-prompt-preview">{s.latex.slice(0, 120)}{s.latex.length > 120 ? '…' : ''}</code>
        <div className="equation-prompt-actions">
          <button type="button" className="titlebar-btn" onClick={insert}>
            Insert {s.display ? 'display' : 'inline'}
          </button>
          <button type="button" className="titlebar-btn" onClick={dismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}
