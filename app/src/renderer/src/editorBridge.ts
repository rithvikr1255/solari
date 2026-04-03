import type { EditorView } from '@codemirror/view'

let view: EditorView | null = null

export function setEditorView(v: EditorView | null) {
  view = v
}

export function getEditorView() {
  return view
}
