type LocketState = {
  folderPath: string | null
  files: string[]
  activeFile: string | null
  open: boolean
}

let state: LocketState = { folderPath: null, files: [], activeFile: null, open: false }
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function subscribeLocket(callback: () => void) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

export function getLocketSnapshot(): LocketState {
  return state
}

export function setLocketFolder(folderPath: string | null) {
  state = { ...state, folderPath }
  emit()
}

export function setLocketFiles(files: string[]) {
  state = { ...state, files }
  emit()
}

export function setActiveFile(activeFile: string | null) {
  state = { ...state, activeFile }
  emit()
}

export function setLocketOpen(open: boolean) {
  state = { ...state, open }
  emit()
}
