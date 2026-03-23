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


