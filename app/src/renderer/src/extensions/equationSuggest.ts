import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { getEquationCatalog } from '../referenceContext'

const DEBOUNCE_MS = 2200
const RECENT_CHARS = 900
const COOLDOWN_MS = 12000

const API = 'http://localhost:3001'

let catalogSig = ''
const dismissed = new Set<string>()
let cooldownUntil = 0
let lastRecentHash = ''

function isInCode(state: EditorView['state'], pos: number): boolean {
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

function hashRecent(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return String(h)
}

export const equationSuggest = ViewPlugin.fromClass(
  class {
    timer: ReturnType<typeof setTimeout> | null = null

    update(update: ViewUpdate) {
      if (!update.docChanged) return
      for (const tr of update.transactions) {
        if (!tr.isUserEvent('input')) continue
        this.schedule(update.view)
        return
      }
    }

    schedule(view: EditorView) {
      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(() => this.run(view), DEBOUNCE_MS)
    }

    async run(view: EditorView) {
      this.timer = null
      if (Date.now() < cooldownUntil) return
      const equations = getEquationCatalog()
      if (equations.length === 0) return
      const sig = equations.map((e) => e.id).join('\0')
      if (sig !== catalogSig) {
        catalogSig = sig
        dismissed.clear()
        lastRecentHash = ''
      }
      const cursor = view.state.selection.main.head
      if (isInCode(view.state, cursor)) return
      const doc = view.state.doc.toString()
      const start = Math.max(0, cursor - RECENT_CHARS)
      const recentText = doc.slice(start, cursor)
      if (recentText.trim().length < 24) return
      const rh = hashRecent(recentText)
      if (rh === lastRecentHash) return
      lastRecentHash = rh
      try {
        const res = await fetch(`${API}/api/suggest-equation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recentText, equations })
        })
        if (!res.ok) return
        const data = (await res.json()) as {
          match?: boolean
          id?: string
          latex?: string
          label?: string
          display?: boolean
        }
        if (!data.match || !data.id || !data.latex) return
        if (dismissed.has(data.id)) return
        if (view.state.selection.main.head !== cursor) return
        cooldownUntil = Date.now() + COOLDOWN_MS
        window.dispatchEvent(
          new CustomEvent('solari-equation-suggest', {
            detail: {
              id: data.id,
              latex: data.latex,
              label: data.label ?? data.id,
              display: data.display === true
            }
          })
        )
      } catch {}
    }

    destroy() {
      if (this.timer) clearTimeout(this.timer)
    }
  }
)

export function dismissEquationSuggestion(id: string) {
  dismissed.add(id)
}

export function acceptEquationSuggestion(id: string) {
  dismissed.add(id)
}
