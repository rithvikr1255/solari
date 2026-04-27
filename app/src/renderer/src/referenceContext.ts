const MAX_TEXT = 45000
const COMBINED_MAX = 48000
// How much ref text to include in correction context — enough for domain vocabulary,
// not so much that the model conflates reference content with what it should return.
const REF_CONTEXT_LIMIT = 3500

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
  const refSnippet = ref.slice(0, REF_CONTEXT_LIMIT)
  let combined = `${refSnippet}\n\n---\n${localBeforeCursor}`
  if (combined.length > COMBINED_MAX) combined = combined.slice(-COMBINED_MAX)
  return combined
}
