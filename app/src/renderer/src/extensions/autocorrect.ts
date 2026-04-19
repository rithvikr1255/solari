import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { hasMisspelling } from '../utils/spellCheck'
import { buildCorrectContext } from '../referenceContext'

const CONTEXT_CHARS = 400
const IDLE_MS = 2000
const MIN_CHARS = 8

const MATH_FN_RE = /\b(log|ln|sin|cos|tan|sec|csc|cot|exp|lim|max|min|det|ker|dim)\s*[\(\d\w]/i
const MATH_EXPR_RE = /\b\w+[\^_]\w/
const GREEK_RE =
  /\b(alpha|beta|gamma|delta|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|chi|psi|omega)\b/i

function needsFormatting(text: string): boolean {
  if (hasMisspelling(text)) return true
  if (MATH_FN_RE.test(text)) return true
  if (MATH_EXPR_RE.test(text)) return true
  if (GREEK_RE.test(text)) return true
  return false
}

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

// Lezer only creates FencedCode nodes for closed fences — unclosed blocks aren't in the tree.
function isAfterOpenFence(docText: string, pos: number): boolean {
  const upTo = docText.slice(0, pos)
  const backtick = (upTo.match(/^```/gm) ?? []).length
  const tilde = (upTo.match(/^~~~/gm) ?? []).length
  return backtick % 2 !== 0 || tilde % 2 !== 0
}

const CODE_KEYWORD_RE =
  /^\s*(int|float|double|char|bool|void|return|if|else|for|while|do|switch|case|break|continue|class|struct|enum|namespace|template|include|define|import|from|def|fn|let|const|var|function|async|await|public|private|protected|static|new|delete|null|nullptr|true|false|this|self)\b/m
const CODE_PUNCT_RE = /[;{}](\s|$)/m

function looksLikeCode(text: string): boolean {
  if (text.includes('```') || text.includes('~~~')) return true
  if (CODE_KEYWORD_RE.test(text)) return true
  if (CODE_PUNCT_RE.test(text)) return true
  return false
}

function shouldSkip(
  text: string,
  state: EditorState,
  from: number,
  to: number,
  docText: string
): boolean {
  if (isInCode(state, from + 1)) return true
  if (to > from + 1 && isInCode(state, to - 1)) return true
  if (isAfterOpenFence(docText, from)) return true
  if (isAfterOpenFence(docText, to)) return true
  if (looksLikeCode(text)) return true
  return false
}

function findSentenceStart(docText: string, end: number): number {
  const lookback = docText.slice(Math.max(0, end - 600), end)
  const base = end - lookback.length
  for (let i = lookback.length - 1; i >= 0; i--) {
    const ch = lookback[i]
    if (ch === '\n') {
      if (i > 0 && lookback[i - 1] === '\n') return base + i + 1
      if (lookback.length - i > MIN_CHARS) return base + i + 1
    }
    if ((ch === '.' || ch === '!' || ch === '?') && i < lookback.length - 1) {
      const next = lookback[i + 1]
      if (next === ' ' || next === '\n') return base + i + 2
    }
  }
  return base
}

function findParagraphStart(docText: string, end: number): number {
  const lookback = docText.slice(Math.max(0, end - 2000), end)
  const base = end - lookback.length
  const idx = lookback.lastIndexOf('\n\n')
  return idx === -1 ? base : base + idx + 2
}

export const autocorrect = ViewPlugin.fromClass(
  class {
    idleTimer: ReturnType<typeof setTimeout> | null = null
    lastIdlePos = 0

    constructor(_view: EditorView) {}

    update(update: ViewUpdate) {
      if (!update.docChanged) return

      for (const tr of update.transactions) {
        if (!tr.isUserEvent('input')) continue

        tr.changes.iterChanges((_fromA, _toA, _fromB, toB, inserted) => {
          const ch = inserted.toString()
          const isNewline = ch[0] === '\n'
          const view = update.view
          const docText = update.state.doc.toString()

          const insertStart = toB - ch.length
          const charBeforeInsert = insertStart > 0 ? docText[insertStart - 1] : ''

          if (isNewline && charBeforeInsert === '\n') {
            const paraEnd = insertStart - 1
            const paraStart = findParagraphStart(docText, paraEnd)
            const text = docText.slice(paraStart, paraEnd)
            if (
              text.trim().length >= MIN_CHARS &&
              !shouldSkip(text, update.state, paraStart, paraEnd, docText)
            ) {
              this.cancelIdle()
              this.lastIdlePos = paraEnd
              setTimeout(() => this.correct(view, paraStart, paraEnd, text, true), 0)
              return
            }
          }

          if (
            (ch === ' ' || isNewline) &&
            (charBeforeInsert === '.' || charBeforeInsert === '!' || charBeforeInsert === '?')
          ) {
            const sentenceEnd = insertStart
            const sentenceStart = findSentenceStart(docText, sentenceEnd)
            const text = docText.slice(sentenceStart, sentenceEnd)
            if (
              text.trim().length >= MIN_CHARS &&
              !shouldSkip(text, update.state, sentenceStart, sentenceEnd, docText) &&
              needsFormatting(text)
            ) {
              this.cancelIdle()
              this.lastIdlePos = sentenceEnd
              setTimeout(() => this.correct(view, sentenceStart, sentenceEnd, text, false), 0)
              return
            }
          }

          if (isNewline && charBeforeInsert !== '\n') {
            const line = update.state.doc.lineAt(Math.max(0, insertStart - 1))
            if (
              line.text.trim().length >= MIN_CHARS &&
              !shouldSkip(line.text, update.state, line.from, line.to, docText) &&
              needsFormatting(line.text)
            ) {
              this.cancelIdle()
              this.lastIdlePos = line.to
              setTimeout(() => this.correct(view, line.from, line.to, line.text, false), 0)
              return
            }
          }

          this.resetIdle(view, toB)
        })
      }
    }

    resetIdle(view: EditorView, _cursorPos: number) {
      this.cancelIdle()
      this.idleTimer = setTimeout(() => {
        const state = view.state
        const doc = state.doc
        const cursor = state.selection.main.head
        const docText = doc.toString()

        const sentenceStart = findSentenceStart(docText, cursor)
        const from = Math.max(sentenceStart, this.lastIdlePos)
        const text = doc.sliceString(from, cursor)
        if (
          text.trim().length < MIN_CHARS ||
          shouldSkip(text, state, from, cursor, docText) ||
          !needsFormatting(text)
        )
          return

        this.lastIdlePos = cursor
        this.correct(view, from, cursor, text, false)
      }, IDLE_MS)
    }

    cancelIdle() {
      if (this.idleTimer) {
        clearTimeout(this.idleTimer)
        this.idleTimer = null
      }
    }

    async correct(
      view: EditorView,
      from: number,
      to: number,
      original: string,
      skipSpellGate: boolean
    ) {
      if (!skipSpellGate && !needsFormatting(original)) return
      if (shouldSkip(original, view.state, from, to, view.state.doc.toString())) return

      const docText = view.state.doc.toString()
      const localContext = docText.slice(Math.max(0, from - CONTEXT_CHARS), from)
      const context = buildCorrectContext(localContext)

      try {
        const res = await fetch('http://localhost:3001/api/correct', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: original, context })
        })
        if (!res.ok) return

        const { corrected } = (await res.json()) as { corrected: string }
        if (!corrected || corrected === original) return
        if (view.state.doc.sliceString(from, to) !== original) return

        view.dispatch({
          changes: { from, to, insert: corrected },
          userEvent: 'input.autocorrect'
        })
      } catch {}
    }

    destroy() {
      this.cancelIdle()
    }
  }
)
