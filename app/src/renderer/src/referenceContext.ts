const MAX_TEXT = 45000
const COMBINED_MAX = 48000

type State = { text: string; label: string }

let state: State = { text: '', label: '' }
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
  state = { text: text.slice(0, MAX_TEXT), label: label ?? '' }
  emit()
}

export function clearReference() {
  state = { text: '', label: '' }
  emit()
}

export function getReferenceText() {
  return state.text
}

export function buildCorrectContext(localBeforeCursor: string) {
  const ref = state.text.trim()
  if (!ref) return localBeforeCursor
  let combined = `${ref}\n\n---\n${localBeforeCursor}`
  if (combined.length > COMBINED_MAX) combined = combined.slice(-COMBINED_MAX)
  return combined
}
