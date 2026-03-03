import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType
} from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'
import katex from 'katex'

class KatexWidget extends WidgetType {
  constructor(
    readonly latex: string,
    readonly displayMode: boolean
  ) {
    super()
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = this.displayMode ? 'cm-katex-block' : 'cm-katex-inline'
    katex.render(this.latex, span, { throwOnError: false, displayMode: this.displayMode })
    return span
  }

  eq(other: KatexWidget): boolean {
    return other.latex === this.latex && other.displayMode === this.displayMode
  }
}

function buildKatexDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const docText = view.state.doc.toString()
  const selection = view.state.selection.main

  // Match $$...$$ (block) before $...$ (inline) to avoid false matches
  const blockRe = /\$\$([\s\S]+?)\$\$/g
  const inlineRe = /\$([^$\n]+?)\$/g

  const matches: Array<{ from: number; to: number; latex: string; display: boolean }> = []

  let m: RegExpExecArray | null
  while ((m = blockRe.exec(docText)) !== null) {
    matches.push({ from: m.index, to: m.index + m[0].length, latex: m[1], display: true })
  }
  while ((m = inlineRe.exec(docText)) !== null) {
    // Skip if this range overlaps any already-captured block match
    const inside = matches.some((b) => m!.index >= b.from && m!.index + m![0].length <= b.to)
    if (!inside) {
      matches.push({ from: m.index, to: m.index + m[0].length, latex: m[1], display: false })
    }
  }

  matches.sort((a, b) => a.from - b.from)

  for (const { from, to, latex, display } of matches) {
    if (selection.from <= to && selection.to >= from) continue
    builder.add(from, to, Decoration.replace({ widget: new KatexWidget(latex, display) }))
  }

  return builder.finish()
}

export const katexDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildKatexDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet) {
        this.decorations = buildKatexDecorations(update.view)
      }
    }
  },
  { decorations: (v) => v.decorations }
)

export const katexTheme = EditorView.baseTheme({
  '.cm-katex-inline': { display: 'inline-block', verticalAlign: 'middle' },
  '.cm-katex-block': { display: 'block', textAlign: 'center', margin: '8px 0' }
})
