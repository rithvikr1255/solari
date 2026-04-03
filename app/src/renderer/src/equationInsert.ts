import { EditorSelection } from '@codemirror/state'
import { getEditorView } from './editorBridge'

export function insertEquationAtCursor(latex: string, display: boolean) {
  const view = getEditorView()
  if (!view) return false
  const pos = view.state.selection.main.head
  const body = display ? `\n\n$$\n${latex}\n$$\n\n` : `$${latex}$`
  view.dispatch({
    changes: { from: pos, to: pos, insert: body },
    selection: EditorSelection.cursor(pos + body.length),
    userEvent: 'input.equationInsert'
  })
  return true
}
