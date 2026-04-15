import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { startTestServer, stopTestServer, post } from '../helpers/server.js'
import { OS_SLIDE_TEXT } from '../helpers/fixtures.js'

const hasKey = Boolean(process.env.ANTHROPIC_API_KEY)

beforeAll(startTestServer)
afterAll(stopTestServer)

describe('POST /api/correct', () => {
  it('returns 400 when text field is missing', async () => {
    const res = await post('/api/correct', {})
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it.skipIf(!hasKey)('fixes a clear typo', async () => {
    const res = await post('/api/correct', { text: 'The quikc brown fox jmups over the lzy dog.' })
    expect(res.status).toBe(200)
    const { corrected } = (await res.json()) as { corrected: string }
    expect(corrected).toMatch(/quick/i)
    expect(corrected).toMatch(/jumps/i)
    expect(corrected).toMatch(/lazy/i)
  })

  it.skipIf(!hasKey)('preserves technical terms does not corrupt vaddr or TLB', async () => {
    const text = 'The vaddr is mapped thorugh the TLB beofre hitting the paeg table.'
    const res = await post('/api/correct', { text })
    expect(res.status).toBe(200)
    const { corrected } = (await res.json()) as { corrected: string }
    expect(corrected).toMatch(/vaddr/)
    expect(corrected).toMatch(/TLB/)
    expect(corrected).toMatch(/through/i)
    expect(corrected).toMatch(/before/i)
    expect(corrected).toMatch(/page/i)
  })

  it.skipIf(!hasKey)('uses lecture context to avoid false positives on domain vocab', async () => {
    const text = 'The paddr is resolved form the TLB on a cache hit.'
    const res = await post('/api/correct', { text, context: OS_SLIDE_TEXT })
    expect(res.status).toBe(200)
    const { corrected } = (await res.json()) as { corrected: string }
    expect(corrected).toMatch(/paddr/)
    expect(corrected).toMatch(/from/i)
  })

  it.skipIf(!hasKey)('does not alter LaTeX or markdown syntax', async () => {
    const text = 'The formula is $\\frac{a}{b}$ and the eequation must be preservd.'
    const res = await post('/api/correct', { text })
    expect(res.status).toBe(200)
    const { corrected } = (await res.json()) as { corrected: string }
    expect(corrected).toContain('$\\frac{a}{b}$')
    expect(corrected).toMatch(/preserved/i)
  })
})

describe('POST /api/correct-word', () => {
  it('returns 400 when word field is missing', async () => {
    const res = await post('/api/correct-word', {})
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it.skipIf(!hasKey)('corrects a transposed-letter typo', async () => {
    const res = await post('/api/correct-word', {
      word: 'teh',
      contextBefore: 'I need',
      contextAfter: 'help with this.',
    })
    expect(res.status).toBe(200)
    const { corrected } = (await res.json()) as { corrected: string }
    expect(corrected).toBe('the')
  })

  it.skipIf(!hasKey)('preserves technical identifiers unchanged', async () => {
    const res = await post('/api/correct-word', {
      word: 'vaddr',
      contextBefore: 'The',
      contextAfter: 'register holds the virtual address.',
    })
    expect(res.status).toBe(200)
    const { corrected } = (await res.json()) as { corrected: string }
    expect(corrected).toBe('vaddr')
  })

  it.skipIf(!hasKey)('returns a single word with no added punctuation', async () => {
    const res = await post('/api/correct-word', { word: 'recieve' })
    expect(res.status).toBe(200)
    const { corrected } = (await res.json()) as { corrected: string }
    expect(corrected).toMatch(/^\w+$/)
    expect(corrected).toBe('receive')
  })
})
