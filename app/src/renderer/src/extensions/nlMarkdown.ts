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
 { re: /^(?:check|checkbox|todo|task):\s+(.+)$/i, convert: (m) => `- [ ] ${m[1]}` },
 { re: /^h([1-6]):\s+(.+)$/i, convert: (m) => `${'#'.repeat(Number(m[1]))} ${m[2]}` },
 { re: /^heading:\s+(.+)$/i, convert: (m) => `## ${m[1]}` },
 { re: /^(?:quote|q):\s+(.+)$/i, convert: (m) => `> ${m[1]}` },
 { re: /^(?:code|inline):\s+(.+)$/i, convert: (m) => `\`${m[1]}\`` },
 { re: /^(?:bold|b):\s+(.+)$/i, convert: (m) => `**${m[1]}**` },
 { re: /^(?:italic|i|em):\s+(.+)$/i, convert: (m) => `*${m[1]}*` },
 {
   re: /^(?:list|ul|items):\s+(.+)$/i,
   convert: (m) =>
     m[1]
       .split(',')
       .map((s) => `- ${s.trim()}`)
       .join('\n')
 },
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
   const res = await fetch('http://localhost:3001/api/nl-to-markdown', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify(ref ? { text, context: ref } : { text })
   })
   if (!res.ok) return
   const { markdown } = (await res.json()) as { markdown: string }
   if (!markdown || markdown === text) return
   if (view.state.doc.sliceString(lineFrom, lineTo) !== text) return

   // If the LLM returned a complete fenced code block, insert a blank line before the
   // closing fence and place the cursor there so the user can keep typing inside.
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
         const text = line.text.trim()


         if (text.length === 0) return
         if (/^[-*#>|~]/.test(text)) return
         if (line.from + 1 <= line.to && isInCode(update.state, line.from + 1)) return
        if (/^[`~]{3}/.test(text)) return


         const mathMatch = text.match(MATH_SHORTHAND_RE)
         if (mathMatch) {
           const mathBody = mathMatch[1]
           setTimeout(() => callImproveMathAndApply(view, line.from, line.to, line.text, mathBody), 0)
           return
         }

         const converted = tryRegexConvert(text)
         if (converted !== null) {
           setTimeout(() => {
             if (view.state.doc.sliceString(line.from, line.to) !== line.text) return
             view.dispatch({
               changes: { from: line.from, to: line.to, insert: converted },
               userEvent: 'input.nlMarkdown'
             })
           }, 0)
           return
         }


         if (NL_HINT_RE.test(text)) {
           setTimeout(() => callLLMAndApply(view, line.from, line.to, text), 0)
         }
       })
     }
   }
 }
)
