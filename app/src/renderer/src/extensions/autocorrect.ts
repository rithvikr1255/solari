import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { EditorState } from '@codemirror/state'

const CONTEXT_CHARS = 400
const DEBOUNCE_MS = 150

const WORD_BOUNDARY_RE = /^[\s.,!?;:\)\]"']$/

function isInCode(state: EditorState, pos: number): boolean {
  let node = syntaxTree(state).resolveInner(pos, 1)
  while (node) {
    if (
      node.name === 'FencedCode' ||
      node.name === 'InlineCode' ||
      node.name === 'CodeBlock' ||
      node.name === 'CodeText'
    )
      return true
    if (!node.parent) break
    node = node.parent
  }
  return false
}

function isInLatex(docText: string, wordFrom: number): boolean {
  const before = docText.slice(Math.max(0, wordFrom - 500), wordFrom)
  let depth = 0
  for (const ch of before) {
    if (ch === '$') depth = depth === 0 ? 1 : 0
  }
  return depth === 1
}

function looksLikeCode(word: string): boolean {
  if (word.length < 2) return true
  if (/[A-Z]{2,}/.test(word)) return true
  if (/[a-z][A-Z]/.test(word)) return true
  if (/[_\-./\\@#<>{}[\]|]/.test(word)) return true
  if (/^\d/.test(word)) return true
  return false
}

export const autocorrect = ViewPlugin.fromClass(
  class {
    timer: ReturnType<typeof setTimeout> | null = null

    constructor(_view: EditorView) {}

    update(update: ViewUpdate) {
      if (!update.docChanged) return

      for (const tr of update.transactions) {
        if (!tr.isUserEvent('input.type')) continue

        tr.changes.iterChanges((_fromA, _toA, _fromB, toB, inserted) => {
          const ch = inserted.toString()
          if (!WORD_BOUNDARY_RE.test(ch)) return

          const doc = update.state.doc
          const wordEnd = toB - ch.length

          let wordStart = wordEnd
          while (wordStart > 0 && !/\s/.test(doc.sliceString(wordStart - 1, wordStart))) {
            wordStart--
          }

          const word = doc.sliceString(wordStart, wordEnd)
          if (word.length < 3) return
          if (looksLikeCode(word)) return
          if (isInCode(update.state, wordStart + 1)) return
          if (isInLatex(doc.toString(), wordStart)) return

          if (this.timer) clearTimeout(this.timer)
          const view = update.view
          this.timer = setTimeout(() => {
            this.correct(view, wordStart, wordEnd, word)
          }, DEBOUNCE_MS)
        })
      }
    }

    async correct(view: EditorView, from: number, to: number, original: string) {
      const docText = view.state.doc.toString()
      const contextBefore = docText.slice(Math.max(0, from - CONTEXT_CHARS), from)
      const contextAfter = docText.slice(to, Math.min(docText.length, to + CONTEXT_CHARS))

      try {
        const res = await fetch('http://localhost:3001/api/correct-word', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ word: original, contextBefore, contextAfter })
        })
        if (!res.ok) return

        const { corrected } = (await res.json()) as { corrected: string }
        if (!corrected || corrected === original) return

        if (view.state.doc.sliceString(from, to) !== original) return

        view.dispatch({
          changes: { from, to, insert: corrected },
          userEvent: 'input.autocorrect'
        })
      } catch {
        // best-effort, silent
      }
    }

    destroy() {
      if (this.timer) clearTimeout(this.timer)
    }
  }
)
