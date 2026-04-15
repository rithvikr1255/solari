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
import { equationSuggest } from '../extensions/equationSuggest'
import { nlMarkdown } from '@renderer/extensions/nlMarkdown'
import { setEditorView } from '../editorBridge'

const initialDoc = ''

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
        equationSuggest,
        nlMarkdown
      ]
    })

    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view
    setEditorView(view)

    return () => {
      setEditorView(null)
      view.destroy()
    }
  }, [])

  return <div ref={containerRef} className="editor-container" />
}
