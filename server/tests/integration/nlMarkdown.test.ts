import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { startTestServer, stopTestServer, post } from '../helpers/server.js'

const hasKey = Boolean(process.env.ANTHROPIC_API_KEY)

beforeAll(startTestServer)
afterAll(stopTestServer)

describe('POST /api/nl-to-markdown', () => {
  it('returns 400 when text field is missing', async () => {
    const res = await post('/api/nl-to-markdown', {})
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it.skipIf(!hasKey)('converts a checkbox shorthand to GFM task list item', async () => {
    const res = await post('/api/nl-to-markdown', { text: '(checkbox) review pull request' })
    expect(res.status).toBe(200)
    const { markdown } = (await res.json()) as { markdown: string }
    expect(markdown).toMatch(/- \[ \]/)
    expect(markdown).toContain('review pull request')
  })

  it.skipIf(!hasKey)('promotes a heading request to a markdown heading', async () => {
    const res = await post('/api/nl-to-markdown', { text: 'make this a heading: Virtual Memory' })
    expect(res.status).toBe(200)
    const { markdown } = (await res.json()) as { markdown: string }
    expect(markdown).toMatch(/^#{1,6}\s+Virtual Memory/i)
  })

  it.skipIf(!hasKey)('converts a bold request to markdown bold', async () => {
    const res = await post('/api/nl-to-markdown', { text: 'bold this: page fault' })
    expect(res.status).toBe(200)
    const { markdown } = (await res.json()) as { markdown: string }
    expect(markdown).toContain('**page fault**')
  })

  it.skipIf(!hasKey)('converts list shorthand to a bullet list', async () => {
    const res = await post('/api/nl-to-markdown', {
      text: 'make a list: apples, bananas, cherries',
    })
    expect(res.status).toBe(200)
    const { markdown } = (await res.json()) as { markdown: string }
    const lines = markdown.split('\n').filter(Boolean)
    expect(lines.length).toBeGreaterThanOrEqual(3)
    lines.forEach((line) => expect(line).toMatch(/^- /))
  })

  it.skipIf(!hasKey)('returns plain markdown without surrounding code fences', async () => {
    const res = await post('/api/nl-to-markdown', { text: '(checkbox) buy groceries' })
    expect(res.status).toBe(200)
    const { markdown } = (await res.json()) as { markdown: string }
    expect(markdown).not.toContain('```')
  })
})
