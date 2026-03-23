import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { oneDark } from '@codemirror/theme-one-dark'
import { markdownDecorations, markdownTheme } from '../extensions/markdownDecorations'
import { katexDecorations, katexTheme } from '../extensions/katexDecorations'
import { autocorrect } from '../extensions/autocorrect'
import { nlMarkdown } from '@renderer/extensions/nlMarkdown'

const initialDoc = `# Welcome to Solari

Start writing your notes here. Markdown is rendered **inline** as you type.

## Features

- **Bold** and *italic* text render live
- \`- [ ] Task\` becomes a checkbox
- Math: $E = mc^2$ or display mode:

$$\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$

---

> Type freely. The AI assistant will clean up your notes in real time.
`

export default function SolariEditor() {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const state = EditorState.create({
      doc: initialDoc,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        lineNumbers(),
        highlightActiveLine(),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        oneDark,
        markdownDecorations,
        markdownTheme,
        katexDecorations,
        katexTheme,
        EditorView.lineWrapping,
        autocorrect,
        nlMarkdown
      ]
    })

    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view

    return () => view.destroy()
  }, [])

  return <div ref={containerRef} className="editor-container" />
}
