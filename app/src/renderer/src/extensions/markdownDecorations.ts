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

class BulletWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-bullet'
    span.textContent = '•'
    return span
  }
  eq(): boolean {
    return true
  }
}

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string
  ) {
    super()
  }

  toDOM(): HTMLElement {
    if (!this.src) {
      const span = document.createElement('span')
      span.className = 'cm-image-alt'
      span.textContent = this.alt || '🖼'
      return span
    }
    const img = document.createElement('img')
    img.src = this.src
    img.alt = this.alt
    img.style.maxHeight = '200px'
    img.style.maxWidth = '100%'
    img.style.display = 'block'
    img.style.margin = '4px 0'
    img.onerror = () => {
      img.style.display = 'none'
    }
    return img
  }

  eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt
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

  // CM6 RangeSetBuilder requires strict ascending order; collect everything then sort.
  type PendingDeco = { from: number; to: number; deco: Decoration }
  const pending: PendingDeco[] = []

  syntaxTree(view.state).iterate({
    enter(node): boolean | void {
      const { from, to, name } = node

      if (name === 'StrongEmphasis') {
        if (cursorOverlaps(from, to, view)) return
        pending.push({ from, to: from + 2, deco: Decoration.replace({}) })
        pending.push({ from: from + 2, to: to - 2, deco: Decoration.mark({ class: 'cm-bold' }) })
        pending.push({ from: to - 2, to, deco: Decoration.replace({}) })
        return false
      }

      if (name === 'Emphasis') {
        if (cursorOverlaps(from, to, view)) return
        pending.push({ from, to: from + 1, deco: Decoration.replace({}) })
        pending.push({ from: from + 1, to: to - 1, deco: Decoration.mark({ class: 'cm-italic' }) })
        pending.push({ from: to - 1, to, deco: Decoration.replace({}) })
        return false
      }

      if (name.startsWith('ATXHeading')) {
        const level = parseInt(name.replace('ATXHeading', ''), 10)
        const lineText = doc.lineAt(from).text
        const hashMatch = lineText.match(/^#{1,6} /)
        if (!hashMatch) return
        const hashEnd = from + hashMatch[0].length
        if (!cursorOverlaps(from, to, view)) {
          pending.push({ from, to: hashEnd, deco: Decoration.replace({}) })
        }
        pending.push({ from, to, deco: Decoration.line({ class: `cm-heading cm-h${level}` }) })
        return false
      }

      if (name === 'HorizontalRule') {
        if (cursorOverlaps(from, to, view)) return
        pending.push({ from, to, deco: Decoration.replace({ widget: new HrWidget() }) })
        return false
      }

      if (name === 'InlineCode') {
        if (cursorOverlaps(from, to, view)) return
        const text = doc.sliceString(from, to)
        const markerLen = text.startsWith('``') ? 2 : 1
        if (to - from <= markerLen * 2) return false
        pending.push({ from, to: from + markerLen, deco: Decoration.replace({}) })
        pending.push({
          from: from + markerLen,
          to: to - markerLen,
          deco: Decoration.mark({ class: 'cm-inline-code' })
        })
        pending.push({ from: to - markerLen, to, deco: Decoration.replace({}) })
        return false
      }

      if (name === 'Blockquote') {
        let pos = from
        while (pos <= to) {
          const line = doc.lineAt(pos)

          pending.push({ from: line.from, to: line.from, deco: Decoration.line({ class: 'cm-blockquote-line' }) })
          if (!cursorOverlaps(line.from, line.to, view)) {
            const lineText = line.text
            const prefixMatch = lineText.match(/^>\s?/)
            if (prefixMatch) {
              pending.push({
                from: line.from,
                to: line.from + prefixMatch[0].length,
                deco: Decoration.replace({})
              })
            }
          }
          if (line.to >= to) break
          pos = line.to + 1
        }
        return false
      }

      if (name === 'FencedCode') {
        let pos = from
        while (pos <= to) {
          const line = doc.lineAt(pos)
          pending.push({ from: line.from, to: line.from, deco: Decoration.line({ class: 'cm-code-block-line' }) })
          if (line.to >= to) break
          pos = line.to + 1
        }
        for (const mark of node.node.getChildren('CodeMark')) {
          const fenceLine = doc.lineAt(mark.from)
          if (!cursorOverlaps(fenceLine.from, fenceLine.to, view)) {
            pending.push({ from: mark.from, to: mark.to, deco: Decoration.replace({}) })
          }
        }
        const info = node.node.getChild('CodeInfo')
        if (info && !cursorOverlaps(doc.lineAt(info.from).from, doc.lineAt(info.from).to, view)) {
          pending.push({ from: info.from, to: info.to, deco: Decoration.mark({ class: 'cm-code-lang' }) })
        }
        return false
      }

      if (name === 'Link') {
        if (cursorOverlaps(from, to, view)) return false
        let labelFrom = -1, labelTo = -1
        let parenOpen = -1, parenClose = -1
        node.node.cursor().iterate((child) => {
          if (child.name === 'LinkMark') {
            const ch = doc.sliceString(child.from, child.to)
            if (ch === '[') {
              labelFrom = child.to
            } else if (ch === ']') {
              labelTo = child.from
            } else if (ch === '(') {
              parenOpen = child.from
            } else if (ch === ')') {
              parenClose = child.to
            }
          }
        })
        if (labelFrom !== -1 && labelTo !== -1 && parenOpen !== -1 && parenClose !== -1) {
          pending.push({ from, to: labelFrom, deco: Decoration.replace({}) })
          pending.push({ from: labelFrom, to: labelTo, deco: Decoration.mark({ class: 'cm-link-text' }) })
          pending.push({ from: labelTo, to: parenClose, deco: Decoration.replace({}) })
        }
        return false
      }

      if (name === 'Image') {
        if (cursorOverlaps(from, to, view)) return false
        const raw = doc.sliceString(from, to)
        const match = raw.match(/^!\[([^\]]*)\]\(([^)]*)\)/)
        if (match) {
          const alt = match[1]
          const src = match[2]
          pending.push({ from, to, deco: Decoration.replace({ widget: new ImageWidget(src, alt) }) })
        }
        return false
      }

      if (name === 'ListMark') {
        const markerText = doc.sliceString(from, to)
        if (markerText === '-' || markerText === '*' || markerText === '+') {
          const line = doc.lineAt(from)
          if (!cursorOverlaps(line.from, line.to, view)) {
            pending.push({ from, to, deco: Decoration.replace({ widget: new BulletWidget() }) })
          }
        }
        return false
      }
    }
  })

  // lezer parses `- [ ]` as a list item, not a checkbox node, so scan lines directly
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i)
    const unchecked = line.text.match(/^(\s*[-*+] )\[ \] /)
    const checked = line.text.match(/^(\s*[-*+] )\[x\] /i)
    const match = unchecked ?? checked
    if (match && !cursorOverlaps(line.from, line.to, view)) {
      const prefixLen = match[1].length
      const boxStart = line.from + prefixLen
      const boxEnd = boxStart + 4
      pending.push({
        from: boxStart,
        to: boxEnd,
        deco: Decoration.replace({ widget: new CheckboxWidget(!!checked) })
      })
    }
  }

  pending.sort((a, b) => a.from - b.from || a.to - b.to)

  for (const { from, to, deco } of pending) {
    builder.add(from, to, deco)
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
  '.cm-hr': { border: 'none', borderTop: '1px solid #555', margin: '8px 0', display: 'block' },
  '.cm-inline-code': {
    fontFamily: 'monospace',
    background: 'rgba(255,255,255,0.08)',
    borderRadius: '3px',
    padding: '1px 4px',
    fontSize: '0.9em'
  },
  '.cm-blockquote-line': {
    borderLeft: '3px solid #6c8ebf',
    paddingLeft: '12px',
    background: 'rgba(108,142,191,0.05)',
    color: '#bbb'
  },
  '.cm-code-block-line': {
    fontFamily: 'monospace',
    background: 'rgba(0,0,0,0.2)',
    padding: '0 8px'
  },
  '.cm-code-lang': {
    fontSize: '0.75em',
    color: '#888',
    fontFamily: 'monospace'
  },
  '.cm-link-text': {
    color: '#4a9eff',
    textDecoration: 'underline',
    cursor: 'pointer'
  },
  '.cm-bullet': {
    color: '#888',
    marginRight: '4px'
  },
  '.cm-image-alt': {
    color: '#888',
    fontStyle: 'italic'
  }
})
