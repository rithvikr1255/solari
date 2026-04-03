const MAX_TEXT = 45000
const COMBINED_MAX = 48000

export type EquationEntry = {
  id: string
  latex: string
  label: string
  triggers: string[]
  display?: boolean
}

type State = {
  text: string
  label: string
  equations: EquationEntry[]
  formulaHint: string
}

let state: State = { text: '', label: '', equations: [], formulaHint: '' }
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function subscribe(callback: () => void) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

export function getReferenceSnapshot(): State {
  return state
}

export function setReference(text: string, label?: string) {
  state = {
    text: text.slice(0, MAX_TEXT),
    label: label ?? '',
    equations: [],
    formulaHint: ''
  }
  emit()
}

export function setEquationCatalog(equations: EquationEntry[]) {
  state = { ...state, equations }
  emit()
}

export function setFormulaHint(hint: string) {
  state = { ...state, formulaHint: hint }
  emit()
}

export function clearReference() {
  state = { text: '', label: '', equations: [], formulaHint: '' }
  emit()
}

export function getReferenceText() {
  return state.text
}

export function getEquationCatalog() {
  return state.equations
}

export function buildCorrectContext(localBeforeCursor: string) {
  const ref = state.text.trim()
  if (!ref) return localBeforeCursor
  let combined = `${ref}\n\n---\n${localBeforeCursor}`
  if (combined.length > COMBINED_MAX) combined = combined.slice(-COMBINED_MAX)
  return combined
}
