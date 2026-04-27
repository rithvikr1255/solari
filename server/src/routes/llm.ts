import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'

export const llmRouter = Router()

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are a formatting assistant for Solari, a markdown note-taking app for students.
Your job: fix typos AND silently reformat unstructured math/markdown so notes look beautiful without the user needing to know the syntax.

TYPO FIXES:
- Fix genuine typos (transposed letters, missing letters, fat-finger errors)
- Preserve: technical terms, proper nouns, code identifiers, domain vocabulary

MATH FORMATTING:
- If text contains math expressions NOT already wrapped in $ or $$, wrap them:
  - Inline expressions (mid-sentence): use $...$
  - Standalone display equations (own line or set off): use $$...$$
- Add backslashes to standard math functions when used mathematically:
  log → \\log,  ln → \\ln,  sin → \\sin,  cos → \\cos,  tan → \\tan,
  exp → \\exp,  lim → \\lim,  max → \\max,  min → \\min,  det → \\det
- Convert Greek letter names to LaTeX when in math context:
  alpha → \\alpha,  beta → \\beta,  theta → \\theta,  pi → \\pi, etc.
- Do NOT wrap already-delimited LaTeX ($...$, $$...$$) again
- Do NOT convert Greek names in clearly non-math prose ("the Alpha team")

MARKDOWN FORMATTING:
- If a standalone short line looks like a section heading (title-case or all-caps, no trailing period, ≤ 60 chars) and has no # prefix, add one:
  "Introduction" → "# Introduction"
  "Results and Discussion" → "## Results and Discussion"

PRESERVE UNCHANGED:
- Existing LaTeX delimiters and content
- Code blocks (fenced or inline). NEVER add \`\`\` or ~~~ fence markers that are not already in the input.
- Existing markdown syntax (**bold**, *italic*, [links], etc.)
- Paragraph structure and blank lines

Return ONLY the corrected/formatted text. No explanation, no quotes, no preamble.

Examples:
  "The angle theta satisfies sin(theta) = 0.5" → "The angle $\\theta$ satisfies $\\sin(\\theta) = 0.5$"
  "f(x) = x^2 + 2x + 1" → "$f(x) = x^2 + 2x + 1$"
  "alpha + beta = gamma" → "$\\alpha + \\beta = \\gamma$"
  "Use log base 2 for entropy" → "Use $\\log_2$ for entropy"
  "The Alpha team won" → "The Alpha team won"`

llmRouter.post('/correct', async (req, res) => {
  const { text, context } = req.body as { text: string; context?: string }

  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'text field required' })
    return
  }

  const userMessage = context
    ? `Context (do not correct this, use it for domain understanding):\n${context}\n\nCorrect this text:\n${text}`
    : `Correct this text:\n${text}`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }]
  })
  const corrected = message.content[0].type === 'text' ? message.content[0].text : text
  res.json({ corrected })
})

const WORD_SYSTEM_PROMPT = `You are a word-level autocorrect assistant for a markdown note-taking app.

Given a single word and its surrounding context, decide if the word has a typo.
If it does, return the corrected word. If not, return the word exactly as written.

Fix: transposed letters (teh→the), missing letters, doubled letters, adjacent keyboard key mistakes.
Preserve: technical terms, code identifiers, proper nouns, abbreviations, domain vocabulary, intentional spelling.

Reply with ONLY the (possibly corrected) word. No punctuation added, no explanation.`

llmRouter.post('/correct-word', async (req, res) => {
  const { word, contextBefore, contextAfter } = req.body as {
    word: string
    contextBefore?: string
    contextAfter?: string
  }

  if (!word || typeof word !== 'string') {
    res.status(400).json({ error: 'word field required' })
    return
  }

  const userMessage = [
    contextBefore ? `Context before: ${contextBefore}` : '',
    `Word: ${word}`,
    contextAfter ? `Context after: ${contextAfter}` : ''
  ]
    .filter(Boolean)
    .join('\n')

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 50,
    system: WORD_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }]
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : word
  const corrected = raw.replace(/^["']|["']$/g, '')
  res.json({ corrected })
})

const NL_TO_MARKDOWN_SYSTEM_PROMPT = `You are a markdown formatter for a note-taking app called Solari.
Convert natural language shorthand to proper markdown.

You may be given surrounding lines (the lines written just before the current line) to help understand context and intent.

Rules:
- Return ONLY the formatted line, no explanation, no code fences wrapping the output
- Preserve content exactly; only change formatting/structure
- Use surrounding lines to infer list type, heading level, or formatting pattern in use
- If the surrounding lines are checkboxes (- [ ]) and the current line looks like a list item, return it as a checkbox
- If the surrounding lines are bullets (- ) and the current line looks like a list item, return it as a bullet
- If you cannot determine intent, return the input unchanged
- For lists, use separate lines with "- " prefix
- For tables, use GFM table syntax with a header separator row

Examples:
(checkbox) pick up milk → - [ ] pick up milk
make this a heading: Introduction → # Introduction
create a task for fix the login bug → - [ ] fix the login bug
this should be bold: important term → **important term**

Context-aware examples (surrounding lines shown before →):
Surrounding: "- [ ] buy milk"
Current: "call dentist" → - [ ] call dentist

Surrounding: "- item one"
Current: "item two" → - item two`

llmRouter.post('/nl-to-markdown', async (req, res) => {
  const { text, context, surroundingLines } = req.body as {
    text: string
    context?: string
    surroundingLines?: string
  }
  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'text field required' })
    return
  }
  const parts: string[] = []
  if (context) parts.push(`Reference (terminology only, do not paste verbatim):\n${context}`)
  if (surroundingLines) parts.push(`Surrounding lines (for context):\n${surroundingLines}`)
  parts.push(`Convert this to markdown:\n${text}`)
  const userContent = parts.join('\n\n')
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: NL_TO_MARKDOWN_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }]
  })
  const markdown = message.content[0].type === 'text' ? message.content[0].text.trim() : text
  res.json({ markdown })
})

const EQUATION_CATALOG_SYSTEM = `You are a math formula extractor and inferrer for a student note-taking app.

Given lecture or textbook text, produce a catalog of relevant mathematical equations in two passes:

PASS 1 — Extract: Find any explicit math notation (LaTeX, Unicode symbols, ASCII math like x^2, integrals, summations, etc.) and convert each to clean LaTeX.

PASS 2 — Infer: For any topic, theorem, concept, or named result mentioned in the text that has a well-known formula (even if the formula itself isn't written out), include that formula. For example:
- "Newton's second law" → F = ma
- "quadratic formula" or "quadratic equation" → x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}
- "Euler's formula" → e^{i\\theta} = \\cos\\theta + i\\sin\\theta
- "Bayes' theorem" → P(A|B) = \\frac{P(B|A)P(A)}{P(B)}
- "chain rule" → \\frac{d}{dx}[f(g(x))] = f'(g(x)) \\cdot g'(x)
Use your knowledge to supply the correct standard formula.

Return ONLY valid JSON (no markdown code fences, no text before or after). Use ONE of these shapes:
1) A JSON array: [ {...}, {...} ]
2) A JSON object: {"equations": [ {...}, {...} ]}

Each item must include:
- id: string (short slug, e.g. "wave-equation")
- latex: string (math body only, no wrapping $ or $$; amsmath ok)
- label: string (human-readable name)
- triggers: string array (key words/phrases that would prompt inserting this formula; use [] if none)
- display: boolean (true for display-style block math, false for inline)

If there is truly no mathematical content and no named theorems or formulas, return [].
Max 24 items.`

function stripJsonFence(s: string): string {
  let t = s.trim()
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')
  }
  return t.trim()
}

function extractJsonArrayFromLlm(raw: string): unknown[] {
  const stripped = stripJsonFence(raw.trim())
  const tryArray = (p: unknown): unknown[] | null => {
    if (Array.isArray(p)) return p
    if (p && typeof p === 'object') {
      const o = p as Record<string, unknown>
      for (const k of ['equations', 'items', 'formulas', 'catalog']) {
        if (Array.isArray(o[k])) return o[k] as unknown[]
      }
    }
    return null
  }
  try {
    const parsed = JSON.parse(stripped)
    const a = tryArray(parsed)
    if (a) return a
  } catch {
    // fall through
  }
  const start = stripped.indexOf('[')
  if (start === -1) return []
  let depth = 0
  let end = -1
  for (let i = start; i < stripped.length; i++) {
    const c = stripped[i]
    if (c === '[') depth++
    else if (c === ']') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end === -1) return []
  try {
    const parsed = JSON.parse(stripped.slice(start, end + 1))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizeTriggers(e: Record<string, unknown>): string[] {
  if (Array.isArray(e.triggers)) {
    return e.triggers
      .filter((t): t is string => typeof t === 'string')
      .map((t) => t.slice(0, 120))
      .slice(0, 12)
  }
  if (typeof e.trigger === 'string') return [e.trigger.slice(0, 120)]
  if (Array.isArray(e.keywords)) {
    return e.keywords
      .filter((t): t is string => typeof t === 'string')
      .map((t) => t.slice(0, 120))
      .slice(0, 12)
  }
  return []
}

function anthropicTextBlocks(message: Anthropic.Messages.Message): string {
  return message.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
}

llmRouter.post('/equation-catalog', async (req, res) => {
  const { text } = req.body as { text?: string }
  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'text field required' })
    return
  }
  const slice = text.slice(0, 35000)
  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      system: EQUATION_CATALOG_SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Extract equations from this reference text:\n\n${slice}`
        }
      ]
    })
    const raw = anthropicTextBlocks(message) || '[]'
    const equations = extractJsonArrayFromLlm(raw)
    const cleaned = equations
      .map((e) => e as Record<string, unknown>)
      .filter((e) => e && (typeof e.latex === 'string' || typeof e.math === 'string'))
      .map((e, i) => {
        const latex = String(e.latex ?? e.math ?? '').trim()
        const idRaw = e.id ?? e.slug ?? e.key
        let id =
          typeof idRaw === 'string' || typeof idRaw === 'number'
            ? String(idRaw).slice(0, 80)
            : ''
        if (!id) id = `eq-${i + 1}`
        const labelRaw = e.label ?? e.name ?? e.title ?? id
        const label = typeof labelRaw === 'string' ? labelRaw : String(labelRaw)
        return {
          id,
          latex: latex.slice(0, 2000),
          label: label.slice(0, 200),
          triggers: normalizeTriggers(e),
          display: e.display === true || e.displayMode === true || e.block === true
        }
      })
      .filter((e) => e.latex.length > 0)
      .slice(0, 24)
    res.json({ equations: cleaned })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'catalog failed'
    res.status(500).json({ error: msg, equations: [] })
  }
})

const CLASSIFY_LINES_SYSTEM = `You are a line classifier for a markdown note-taking app.

You receive a JSON object with:
- "lines": the plain-text lines to classify
- "preceding" (optional): lines already in the document above these lines — use this to understand hierarchy and context

Classify each line as exactly one of:
- "checkbox"     — top-level action item / task / todo (buy X, call Y, fix Z, deploy, review)
- "sub-checkbox" — a sub-task nested under a parent task or checklist item
- "bullet"       — top-level informational point: fact, concept, named topic, definition
- "sub-bullet"   — a detail, example, or sub-point that elaborates on the preceding item
- "heading"      — a section title or major topic label; short, no trailing punctuation
- "none"         — prose sentence, question, math expression, code, or doesn't fit a list

Return ONLY a JSON array of strings, one per input line, same order. No explanation, no fences.

Examples:
["buy milk","call dentist","fix login bug"] → ["checkbox","checkbox","checkbox"]
["Newton's first law","conservation of momentum","kinetic energy"] → ["bullet","bullet","bullet"]
["Introduction","Methods","Results"] → ["heading","heading","heading"]
["The experiment showed results.","We need more data."] → ["none","none"]

Preceding: "- [ ] Deploy backend"
Lines: ["update env vars","run migrations","restart service"] → ["sub-checkbox","sub-checkbox","sub-checkbox"]

Preceding: "- OS Protection Rings"
Lines: ["Ring 0: kernel mode","Ring 3: user mode"] → ["sub-bullet","sub-bullet"]

Preceding: "- Machine Learning"
Lines: ["supervised learning","uses labeled data"] → ["sub-bullet","sub-bullet"]`

llmRouter.post('/classify-lines', async (req, res) => {
  const { lines, preceding } = req.body as { lines?: unknown; preceding?: string }
  if (!Array.isArray(lines) || lines.length === 0) {
    res.status(400).json({ error: 'lines array required' })
    return
  }
  const cleaned = (lines as unknown[])
    .filter((l): l is string => typeof l === 'string' && l.trim().length > 0)
    .slice(0, 20)
  if (cleaned.length === 0) {
    res.status(400).json({ error: 'no valid lines' })
    return
  }
  const userContent = preceding?.trim()
    ? `Preceding context:\n${preceding.trim()}\n\nClassify these lines:\n${JSON.stringify(cleaned)}`
    : JSON.stringify(cleaned)
  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: CLASSIFY_LINES_SYSTEM,
      messages: [{ role: 'user', content: userContent }]
    })
    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '[]'
    let parsed: unknown[] = []
    try { parsed = JSON.parse(stripJsonFence(raw)) } catch { /* fall through */ }
    const valid = new Set(['checkbox', 'sub-checkbox', 'bullet', 'sub-bullet', 'heading', 'none'])
    const types = cleaned.map((_, i) => {
      const t = Array.isArray(parsed) ? parsed[i] : undefined
      return (typeof t === 'string' && valid.has(t)) ? t : 'none'
    })
    res.json({ types })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'classify failed'
    res.status(500).json({ error: msg, types: cleaned.map(() => 'none') })
  }
})

const IMPROVE_LATEX_SYSTEM = `You convert rough ASCII math or informal math notation to clean LaTeX for a note-taking app.

Return ONLY the LaTeX body, no wrapping $ or $$ delimiters, no explanation, no code fences.
If the input is already valid LaTeX, return it unchanged.
If the intent is unclear, return the input unchanged.

Use standard LaTeX: \\frac, \\sum, \\int, \\sqrt, \\begin{pmatrix}, \\vec, \\hat, etc.`

llmRouter.post('/improve-latex', async (req, res) => {
  const { math, context } = req.body as { math: string; context?: string }
  if (!math || typeof math !== 'string') {
    res.status(400).json({ error: 'math field required' })
    return
  }
  const userContent = context
    ? `Domain reference (use for notation style):\n${context}\n\nConvert to clean LaTeX:\n${math}`
    : `Convert to clean LaTeX:\n${math}`
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    system: IMPROVE_LATEX_SYSTEM,
    messages: [{ role: 'user', content: userContent }]
  })
  const improved = message.content[0].type === 'text' ? message.content[0].text.trim() : math
  res.json({ improved })
})

const SUGGEST_EQUATION_SYSTEM = `You decide if the student's recent note text clearly refers to one equation from a provided catalog.

Return ONLY JSON: {"match":false} OR {"match":true,"id":"<id from catalog>","inline":true|false}

Rules:
- match true only when the note clearly discusses the same concept/symbol as one catalog entry (by label or triggers).
- Prefer false when unsure.
- inline true for definitions or short expressions that fit in a sentence; false for multi-line or numbered display equations.
- id must exactly match one catalog id.`

llmRouter.post('/suggest-equation', async (req, res) => {
  const { recentText, equations } = req.body as {
    recentText?: string
    equations?: Array<{
      id: string
      latex: string
      label: string
      triggers: string[]
      display?: boolean
    }>
  }
  if (!recentText || typeof recentText !== 'string') {
    res.status(400).json({ error: 'recentText field required' })
    return
  }
  if (!Array.isArray(equations) || equations.length === 0) {
    res.json({ match: false })
    return
  }
  const catalog = equations.map((e) => ({
    id: e.id,
    label: e.label,
    triggers: e.triggers,
    display: e.display === true
  }))
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    system: SUGGEST_EQUATION_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Catalog:\n${JSON.stringify(catalog)}\n\nRecent note (cursor at end):\n${recentText.slice(-2500)}`
      }
    ]
  })
  const raw =
    message.content[0].type === 'text' ? message.content[0].text.trim() : '{"match":false}'
  let out: { match?: boolean; id?: string; inline?: boolean } = { match: false }
  try {
    out = JSON.parse(stripJsonFence(raw)) as typeof out
  } catch {
    out = { match: false }
  }
  if (!out.match || typeof out.id !== 'string') {
    res.json({ match: false })
    return
  }
  const hit = equations.find((e) => e.id === out.id)
  if (!hit) {
    res.json({ match: false })
    return
  }
  const useDisplay =
    out.inline === true ? false : out.inline === false ? true : hit.display === true
  res.json({
    match: true,
    id: hit.id,
    latex: hit.latex,
    label: hit.label,
    display: useDisplay
  })
})


