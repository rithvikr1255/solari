import { Router } from 'express'
import Anthropic from '@anthropic-ai/sdk'

export const graphRouter = Router()

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface NoteRecord {
  id: string
  title: string
  content: string
}

interface Edge {
  from: string
  to: string
  label: string
  strength: 'strong' | 'weak'
}

const notes = new Map<string, NoteRecord>()
let edges: Edge[] = []

const GRAPH_SYSTEM = `You are a knowledge graph assistant for a markdown note-taking app.
Given a set of notes, find meaningful conceptual connections between them.

Return ONLY valid JSON — an array of edge objects with no wrapping text or code fences:
[{ "from": "<id>", "to": "<id>", "label": "<one sentence describing the connection>", "strength": "strong" | "weak" }]

Rules:
- Only include edges where there is a genuine conceptual link: shared topic, prerequisite relationship, contrast, or elaboration
- Omit trivial or coincidental overlap (e.g. both notes just mention the word "the")
- If no real connections exist, return []
- Both "from" and "to" must be IDs exactly as given in the input
- List each pair only once (A→B, not also B→A)
- "strong" = the notes are clearly about the same concept or one directly builds on the other
- "weak" = the notes touch related but distinct topics`

function stripJsonFence(s: string): string {
  let t = s.trim()
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '')
  }
  return t.trim()
}

async function findEdges(targetNotes: NoteRecord[]): Promise<Edge[]> {
  if (targetNotes.length < 2) return []

  const payload = targetNotes.map((n) => ({
    id: n.id,
    title: n.title,
    content: n.content.slice(0, 1500),
  }))

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: GRAPH_SYSTEM,
    messages: [{ role: 'user', content: `Find connections between these notes:\n${JSON.stringify(payload, null, 2)}` }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : '[]'
  const validIds = new Set(targetNotes.map((n) => n.id))

  try {
    const parsed = JSON.parse(stripJsonFence(raw))
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e): e is Edge =>
        e &&
        typeof e.from === 'string' &&
        typeof e.to === 'string' &&
        typeof e.label === 'string' &&
        (e.strength === 'strong' || e.strength === 'weak') &&
        validIds.has(e.from) &&
        validIds.has(e.to) &&
        e.from !== e.to
    )
  } catch {
    return []
  }
}

graphRouter.get('/graph', (_req, res) => {
  res.json({
    nodes: Array.from(notes.values()).map(({ id, title }) => ({ id, title })),
    edges,
  })
})

graphRouter.post('/graph/note', async (req, res) => {
  const { id, title, content } = req.body as { id?: string; title?: string; content?: string }
  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: 'id field required' })
    return
  }
  if (!title || typeof title !== 'string') {
    res.status(400).json({ error: 'title field required' })
    return
  }
  if (typeof content !== 'string') {
    res.status(400).json({ error: 'content field required' })
    return
  }

  notes.set(id, { id, title, content })
  edges = edges.filter((e) => e.from !== id && e.to !== id)

  const others = Array.from(notes.values()).filter((n) => n.id !== id)
  if (others.length > 0) {
    const newEdges = await findEdges([notes.get(id)!, ...others])
    edges.push(...newEdges)
  }

  const noteEdges = edges.filter((e) => e.from === id || e.to === id)
  res.json({ edges: noteEdges })
})

graphRouter.delete('/graph/note/:id', (req, res) => {
  const { id } = req.params
  if (!notes.has(id)) {
    res.status(404).json({ error: 'note not found' })
    return
  }
  notes.delete(id)
  edges = edges.filter((e) => e.from !== id && e.to !== id)
  res.json({ ok: true })
})

graphRouter.post('/graph/analyze', async (req, res) => {
  const { notes: inputNotes } = req.body as { notes?: unknown }
  if (!Array.isArray(inputNotes) || inputNotes.length === 0) {
    res.status(400).json({ error: 'notes array required' })
    return
  }

  const valid = inputNotes.filter(
    (n): n is NoteRecord =>
      n &&
      typeof n === 'object' &&
      typeof (n as NoteRecord).id === 'string' &&
      typeof (n as NoteRecord).title === 'string' &&
      typeof (n as NoteRecord).content === 'string'
  )

  if (valid.length < 2) {
    res.json({ edges: [] })
    return
  }

  const result = await findEdges(valid)
  res.json({ edges: result })
})
