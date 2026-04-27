import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { getReferenceText } from '../referenceContext'


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


function buildTable(rest: string): string {
 const rows = rest.split('|').map((r) => r.trim().split(',').map((c) => c.trim()))
 if (rows.length === 0) return rest
 const header = rows[0]
 const separator = header.map(() => '---')
 const lines = [
   `| ${header.join(' | ')} |`,
   `| ${separator.join(' | ')} |`,
   ...rows.slice(1).map((r) => `| ${r.join(' | ')} |`)
 ]
 return lines.join('\n')
}


type Pattern = { re: RegExp; convert: (m: RegExpMatchArray) => string }

const PATTERNS: Pattern[] = [
 { re: /^(?:check|checkbox|todo|task)s?:\s+(.+)$/i, convert: (m) => `- [ ] ${m[1]}` },
 { re: /^(?:check|checkbox|todo|task)s?:\s*$/i, convert: () => '**Todo:**' },
 { re: /^h([1-6]):\s+(.+)$/i, convert: (m) => `${'#'.repeat(Number(m[1]))} ${m[2]}` },
 { re: /^heading:\s+(.+)$/i, convert: (m) => `## ${m[1]}` },
 { re: /^(?:quote|q):\s+(.+)$/i, convert: (m) => `> ${m[1]}` },
 { re: /^(?:code|inline):\s+(.+)$/i, convert: (m) => `\`${m[1]}\`` },
 { re: /^(?:bold|b):\s+(.+)$/i, convert: (m) => `**${m[1]}**` },
 { re: /^(?:italic|i|em):\s+(.+)$/i, convert: (m) => `*${m[1]}*` },
 {
   re: /^(?:list|ul|items?):\s+(.+)$/i,
   convert: (m) =>
     m[1]
       .split(',')
       .map((s) => `- ${s.trim()}`)
       .join('\n')
 },
 { re: /^(?:list|ul|items?):\s*$/i, convert: () => '**List:**' },
 { re: /^note:\s+(.+)$/i, convert: (m) => `> **Note:** ${m[1]}` },
 { re: /^(?:warn|warning):\s+(.+)$/i, convert: (m) => `> **Warning:** ${m[1]}` },
 { re: /^link:\s+(.+)$/i, convert: (m) => `[${m[1]}]()` },
 { re: /^(?:hr|rule|divider):?\s*$/i, convert: () => '---' },
 { re: /^table:\s+(.+)$/i, convert: (m) => buildTable(m[1]) }
]


const NL_HINT_RE =
 /\(.*?\)|^(?:make|add|create|turn|set|format)\b|\bheading\b|\btask\b|\bcheckbox\b|\bbold\b|\btable\b/i


function tryRegexConvert(text: string): string | null {
 for (const { re, convert } of PATTERNS) {
   const m = text.match(re)
   if (m) return convert(m)
 }
 return null
}

// Returns the exact prefix (including indentation) to continue a list,
// or null if there is no established list context above.
function getListContinuationPrefix(state: EditorView['state'], lineNum: number): string | null {
 let ln = lineNum - 1
 let skipped = 0
 while (ln >= 1 && skipped < 4) {
   const t = state.doc.line(ln).text
   if (t.trim().length === 0) { ln--; skipped++; continue }

   const cbMatch = t.match(/^(\s*)- \[[ x]\]/)
   if (cbMatch) return cbMatch[1] + '- [ ] '

   const blMatch = t.match(/^(\s*)[-*] /)
   if (blMatch) return blMatch[1] + '- '

   if (/^\*\*(?:todo|tasks?|checklist|to-?do)s?\*\*:?\s*$/i.test(t)) return '- [ ] '
   if (/^#{1,6}\s+(?:todo|tasks?|checklist|to-?do)\b/i.test(t)) return '- [ ] '
   if (/^\*\*(?:list|items?|bullets?)\*\*:?\s*$/i.test(t)) return '- '
   if (/^#{1,6}\s+(?:list|items?)\b/i.test(t)) return '- '

   break
 }
 return null
}


// --- Debounced AI line classifier ---

interface PendingLine {
 view: EditorView
 from: number
 to: number
 content: string
 rawLine: string
 preceding: string
}

let pendingLines: PendingLine[] = []
let classifyTimer: ReturnType<typeof setTimeout> | null = null

function getPrecedingLines(view: EditorView, from: number): string {
 const doc = view.state.doc
 const lineNum = doc.lineAt(from).number
 const lines: string[] = []
 for (let ln = lineNum - 1; ln >= 1 && lines.length < 6; ln--) {
   const t = doc.line(ln).text
   if (t.trim()) lines.unshift(t)
 }
 return lines.join('\n')
}

function enqueueLine(view: EditorView, from: number, to: number, content: string, rawLine: string) {
 const preceding = getPrecedingLines(view, from)
 pendingLines.push({ view, from, to, content, rawLine, preceding })
 if (classifyTimer !== null) clearTimeout(classifyTimer)
 classifyTimer = setTimeout(flushClassify, 1200)
}

async function flushClassify() {
 classifyTimer = null
 if (pendingLines.length === 0) return
 const batch = pendingLines.splice(0)
 const view = batch[0].view

 try {
   const res = await fetch('http://localhost:3001/api/classify-lines', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       lines: batch.map((l) => l.content),
       preceding: batch[0].preceding
     })
   })
   if (!res.ok) return
   const { types } = (await res.json()) as {
     types: Array<'checkbox' | 'bullet' | 'sub-checkbox' | 'sub-bullet' | 'heading' | 'none'>
   }
   if (!Array.isArray(types)) return

   const changes: Array<{ from: number; to: number; insert: string }> = []
   for (let i = 0; i < batch.length; i++) {
     const type = types[i]
     if (!type || type === 'none') continue
     const { from, to, content, rawLine } = batch[i]
     if (view.state.doc.sliceString(from, to) !== rawLine) continue
     let insert: string
     if (type === 'checkbox') insert = '- [ ] ' + content
     else if (type === 'bullet') insert = '- ' + content
     else if (type === 'sub-checkbox') insert = '  - [ ] ' + content
     else if (type === 'sub-bullet') insert = '  - ' + content
     else insert = '## ' + content
     changes.push({ from, to, insert })
   }
   if (changes.length > 0) {
     view.dispatch({ changes, userEvent: 'input.nlMarkdown' })
   }
 } catch {}
}


const MATH_SHORTHAND_RE = /^(?:math|eq|latex):\s+(.+)$/i

async function callImproveMathAndApply(view: EditorView, lineFrom: number, lineTo: number, rawLine: string, mathBody: string) {
 const ref = getReferenceText().trim()
 try {
   const res = await fetch('http://localhost:3001/api/improve-latex', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify(ref ? { math: mathBody, context: ref.slice(0, 8000) } : { math: mathBody })
   })
   if (!res.ok) return
   const { improved } = (await res.json()) as { improved: string }
   if (!improved) return
   const latex = `$${improved}$`
   if (view.state.doc.sliceString(lineFrom, lineTo) !== rawLine) return
   view.dispatch({
     changes: { from: lineFrom, to: lineTo, insert: latex },
     userEvent: 'input.nlMarkdown'
   })
 } catch {}
}

async function callLLMAndApply(view: EditorView, lineFrom: number, lineTo: number, text: string) {
 try {
   const ref = getReferenceText().trim()
   const surroundingLines = getPrecedingLines(view, lineFrom)
   const body: Record<string, string> = { text }
   if (surroundingLines) body.surroundingLines = surroundingLines
   if (ref) body.context = ref.slice(0, 3500)

   const res = await fetch('http://localhost:3001/api/nl-to-markdown', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify(body)
   })
   if (!res.ok) return
   const { markdown } = (await res.json()) as { markdown: string }
   if (!markdown || markdown === text) return
   if (view.state.doc.sliceString(lineFrom, lineTo) !== text) return

   const fenceClose = /\n(?:```|~~~)[^\S\n]*$/.exec(markdown)
   if (fenceClose) {
     const before = markdown.slice(0, fenceClose.index + 1)
     const after = markdown.slice(fenceClose.index + 1)
     view.dispatch({
       changes: { from: lineFrom, to: lineTo, insert: before + '\n' + after },
       selection: { anchor: lineFrom + fenceClose.index + 1 },
       userEvent: 'input.nlMarkdown'
     })
   } else {
     view.dispatch({
       changes: { from: lineFrom, to: lineTo, insert: markdown },
       userEvent: 'input.nlMarkdown'
     })
   }
 } catch {}
}


export const nlMarkdown = ViewPlugin.fromClass(
 class {
   update(update: ViewUpdate) {
     if (!update.docChanged) return

     for (const tr of update.transactions) {
       if (!tr.isUserEvent('input')) continue

       tr.changes.iterChanges((_fromA, _toA, _fromB, toB, inserted) => {
         const ch = inserted.toString()
         if (ch[0] !== '\n') return

         const view = update.view
         const insertStart = toB - ch.length
         if (insertStart === 0) return
         const line = update.state.doc.lineAt(insertStart - 1)
         const rawText = line.text
         const text = rawText.trim()

         if (text.length === 0) return
         if (line.from + 1 <= line.to && isInCode(update.state, line.from + 1)) return
         if (/^[`~]{3}/.test(text)) return

         // Math shorthand
         const mathMatch = text.match(MATH_SHORTHAND_RE)
         if (mathMatch) {
           setTimeout(() => callImproveMathAndApply(view, line.from, line.to, rawText, mathMatch[1]), 0)
           return
         }

         // Exit list: Enter on empty list prefix (any indentation)
         if (/^\s*- \[[ x]\]\s*$/.test(rawText) || /^\s*[-*]\s*$/.test(rawText)) {
           setTimeout(() => {
             if (view.state.doc.sliceString(line.from, line.to) !== rawText) return
             const deleteFrom = line.from > 0 ? line.from - 1 : line.from
             view.dispatch({
               changes: { from: deleteFrom, to: line.to, insert: '' },
               userEvent: 'input.nlMarkdown'
             })
           }, 0)
           return
         }

         // Continue any list item — detect prefix (including indentation) from the raw line
         const checkboxContinue = rawText.match(/^(\s*)- \[[ x]\]\s+\S/)
         const bulletContinue = rawText.match(/^(\s*)[-*] \S/)

         if (checkboxContinue || bulletContinue) {
           const indent = (checkboxContinue ?? bulletContinue)![1]
           const prefix = checkboxContinue ? `${indent}- [ ] ` : `${indent}- `
           const newLineStart = toB
           setTimeout(() => {
             const doc = view.state.doc
             if (newLineStart > doc.length) return
             if (doc.lineAt(newLineStart).text.trim().length > 0) return
             view.dispatch({
               changes: { from: newLineStart, to: newLineStart, insert: prefix },
               selection: { anchor: newLineStart + prefix.length },
               userEvent: 'input.nlMarkdown'
             })
           }, 0)
           return
         }

         // Skip other already-formatted markdown lines
         if (/^[-*#>|~]/.test(text)) return

         // Explicit shorthand patterns
         const converted = tryRegexConvert(text)
         if (converted !== null) {
           setTimeout(() => {
             if (view.state.doc.sliceString(line.from, line.to) !== rawText) return
             view.dispatch({
               changes: { from: line.from, to: line.to, insert: converted },
               userEvent: 'input.nlMarkdown'
             })
           }, 0)
           return
         }

         // Explicit NL commands ("make this bold", "add a heading", etc.)
         if (NL_HINT_RE.test(text)) {
           setTimeout(() => callLLMAndApply(view, line.from, line.to, text), 0)
           return
         }

         // Plain text inside an established list → apply continuation prefix immediately
         const ctxPrefix = getListContinuationPrefix(update.state, line.number)
         if (ctxPrefix) {
           setTimeout(() => {
             if (view.state.doc.sliceString(line.from, line.to) !== rawText) return
             view.dispatch({
               changes: { from: line.from, to: line.to, insert: ctxPrefix + text },
               userEvent: 'input.nlMarkdown'
             })
           }, 0)
           return
         }

         // Plain text with no list context → batch for AI classification
         enqueueLine(view, line.from, line.to, text, rawText)
       })
     }
   }
 }
)
