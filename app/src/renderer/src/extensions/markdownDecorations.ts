import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType
} from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { RangeSetBuilder } from '@codemirror/state'

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super()
  }

  toDOM(): HTMLElement {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.checked = this.checked
    box.className = 'cm-checkbox'
    box.addEventListener('mousedown', (e) => e.preventDefault())
    return box
  }

  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked
  }
}

class HrWidget extends WidgetType {
  toDOM(): HTMLElement {
    const hr = document.createElement('hr')
    hr.className = 'cm-hr'
    return hr
  }
}

function cursorOverlaps(from: number, to: number, view: EditorView): boolean {
  for (const range of view.state.selection.ranges) {
    if (range.from <= to && range.to >= from) return true
  }
  return false
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const doc = view.state.doc

  syntaxTree(view.state).iterate({
    enter(node): boolean | void {
      const { from, to, name } = node

      if (cursorOverlaps(from, to, view)) return

      if (name === 'StrongEmphasis') {
        builder.add(from, from + 2, Decoration.replace({}))
        builder.add(from + 2, to - 2, Decoration.mark({ class: 'cm-bold' }))
        builder.add(to - 2, to, Decoration.replace({}))
        return false
      }

      if (name === 'Emphasis') {
        builder.add(from, from + 1, Decoration.replace({}))
        builder.add(from + 1, to - 1, Decoration.mark({ class: 'cm-italic' }))
        builder.add(to - 1, to, Decoration.replace({}))
        return false
      }

      if (name.startsWith('ATXHeading')) {
        const level = parseInt(name.replace('ATXHeading', ''), 10)
        const lineText = doc.lineAt(from).text
        const hashMatch = lineText.match(/^#{1,6} /)
        if (!hashMatch) return
        const hashEnd = from + hashMatch[0].length
        builder.add(from, hashEnd, Decoration.replace({}))
        builder.add(from, to, Decoration.line({ class: `cm-heading cm-h${level}` }))
        return false
      }

      if (name === 'HorizontalRule') {
        builder.add(from, to, Decoration.replace({ widget: new HrWidget() }))
        return false
      }
    }
  })

  // Checkbox pattern — handled via text scan since lezer parses - [ ] as list items
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)
    const unchecked = line.text.match(/^(\s*[-*+] )\[ \] /)
    const checked = line.text.match(/^(\s*[-*+] )\[x\] /i)
    const match = unchecked ?? checked
    if (match && !cursorOverlaps(line.from, line.to, view)) {
      const prefixLen = match[1].length
      const boxStart = line.from + prefixLen
      const boxEnd = boxStart + (unchecked ? 4 : 4)
      builder.add(boxStart, boxEnd, Decoration.replace({ widget: new CheckboxWidget(!!checked) }))
    }
  }

  return builder.finish()
}

export const markdownDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  { decorations: (v) => v.decorations }
)

export const markdownTheme = EditorView.baseTheme({
  '.cm-bold': { fontWeight: 'bold' },
  '.cm-italic': { fontStyle: 'italic' },
  '.cm-heading': { display: 'block' },
  '.cm-h1': { fontSize: '2em', fontWeight: 'bold', borderBottom: '1px solid #444', paddingBottom: '4px' },
  '.cm-h2': { fontSize: '1.6em', fontWeight: 'bold' },
  '.cm-h3': { fontSize: '1.3em', fontWeight: 'bold' },
  '.cm-h4': { fontSize: '1.1em', fontWeight: 'bold' },
  '.cm-h5': { fontSize: '1em', fontWeight: 'bold' },
  '.cm-h6': { fontSize: '0.9em', fontWeight: 'bold', color: '#aaa' },
  '.cm-checkbox': { cursor: 'pointer', marginRight: '4px', verticalAlign: 'middle' },
  '.cm-hr': { border: 'none', borderTop: '1px solid #555', margin: '8px 0', display: 'block' }
})
