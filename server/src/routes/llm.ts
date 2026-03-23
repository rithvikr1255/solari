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
  console.log('correction');
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
  console.log('corrected');
  res.json({ corrected })
})
