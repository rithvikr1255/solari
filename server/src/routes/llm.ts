import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'

export const llmRouter = Router()

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are a contextual autocorrect assistant for a markdown note-taking app called Solari.

Your job: fix genuine typos while preserving technical terms, code, domain vocabulary, markdown syntax, and LaTeX.

Rules:
- Fix real typos (transposed letters, accidental keys, missing letters)
- Never alter: technical jargon, variable names, command-line syntax, LaTeX, markdown formatting
- Never add words that weren't there or change the meaning
- Return ONLY the corrected text, no explanations, no quotes`

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

Optional reference material may appear before the line to convert; use it only for terminology and intent, not as text to copy verbatim.

Rules:
- Return ONLY the markdown, no explanation, no code fences wrapping the output
- Preserve content exactly; only change formatting/structure
- If you cannot determine intent, return the input unchanged
- For lists, use separate lines with "- " prefix
- For tables, use GFM table syntax with a header separator row

Examples:
(checkbox) pick up milk → - [ ] pick up milk
make this a heading: Introduction → # Introduction
create a task for fix the login bug → - [ ] fix the login bug
this should be bold: important term → **important term**`

llmRouter.post('/nl-to-markdown', async (req, res) => {
  const { text, context } = req.body as { text: string; context?: string }
  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'text field required' })
    return
  }
  const userContent = context
    ? `Reference (terminology only, do not paste verbatim):\n${context}\n\nConvert this to markdown:\n${text}`
    : `Convert this to markdown:\n${text}`
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: NL_TO_MARKDOWN_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }]
  })
  const markdown = message.content[0].type === 'text' ? message.content[0].text.trim() : text
  res.json({ markdown })
})

const EQUATION_CATALOG_SYSTEM = `You extract mathematical equations and formulas from lecture or textbook text for a note app.

Return ONLY valid JSON (no markdown code fences, no text before or after). Use ONE of these shapes:
1) A JSON array: [ {...}, {...} ]
2) A JSON object: {"equations": [ {...}, {...} ]}

Each item must include:
- id: string (short slug, e.g. "wave-equation")
- latex: string (math body only, no wrapping $ or $$; amsmath ok)
- label: string (human-readable)
- triggers: string array (phrases/symbols for matching; use [] if none)
- display: boolean (true for display-style math)

If there are no equations, return [] or {"equations":[]}.
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


