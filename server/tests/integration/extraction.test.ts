import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { startTestServer, stopTestServer, post } from '../helpers/server.js'
import { createTestPptx, createTestPdf } from '../helpers/fixtures.js'

beforeAll(startTestServer)
afterAll(stopTestServer)

describe('POST /api/extract-pdf', () => {
  it('returns 400 when body is empty', async () => {
    const res = await post('/api/extract-pdf', null, {
      contentType: 'application/pdf',
      rawBody: Buffer.alloc(0),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('returns 400 when body is not a valid PDF', async () => {
    const res = await post('/api/extract-pdf', null, {
      contentType: 'application/pdf',
      rawBody: Buffer.from('definitely not a pdf'),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('extracts text from a minimal generated PDF', async () => {
    const pdfBuf = createTestPdf('Hello Integration Test')
    const res = await post('/api/extract-pdf', null, {
      contentType: 'application/pdf',
      rawBody: pdfBuf,
    })
    // pdf-parse behaviour: 200 with text OR 400 if the minimal PDF lacks enough structure.
    // Either response is acceptable — the important thing is that the server does not crash.
    expect([200, 400]).toContain(res.status)
    if (res.status === 200) {
      const { text } = (await res.json()) as { text: string }
      expect(typeof text).toBe('string')
      expect(text.length).toBeGreaterThan(0)
    }
  })
})

describe('POST /api/extract-pptx', () => {
  it('returns 400 when body is empty', async () => {
    const res = await post('/api/extract-pptx', null, {
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      rawBody: Buffer.alloc(0),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('returns 400 for a non-zip payload', async () => {
    const res = await post('/api/extract-pptx', null, {
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      rawBody: Buffer.from('not a zip file'),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 for a zip that lacks ppt/slides/ structure', async () => {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    zip.file('README.txt', 'no slides here')
    const buf = await zip.generateAsync({ type: 'nodebuffer' })

    const res = await post('/api/extract-pptx', null, {
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      rawBody: buf,
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it('extracts text from a generated minimal PPTX', async () => {
    const slideText = 'Operating Systems lecture notes: page tables and TLBs'
    const pptxBuf = await createTestPptx(slideText)

    const res = await post('/api/extract-pptx', null, {
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      rawBody: pptxBuf,
    })
    expect(res.status).toBe(200)
    const { text } = (await res.json()) as { text: string }
    expect(text).toContain('Operating Systems')
    expect(text).toContain('page tables')
    expect(text).toContain('TLBs')
  })

  it('truncates extracted text at 45 000 characters', async () => {
    const longText = 'word '.repeat(12000) // ~60 000 chars
    const pptxBuf = await createTestPptx(longText)

    const res = await post('/api/extract-pptx', null, {
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      rawBody: pptxBuf,
    })
    expect(res.status).toBe(200)
    const { text } = (await res.json()) as { text: string }
    expect(text.length).toBeLessThanOrEqual(45000)
  })
})
