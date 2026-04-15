import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { startTestServer, stopTestServer, post } from '../helpers/server.js'
import { createTestPptx, OS_SLIDE_TEXT } from '../helpers/fixtures.js'

const hasKey = Boolean(process.env.ANTHROPIC_API_KEY)

beforeAll(startTestServer)
afterAll(stopTestServer)

describe('Full Solari pipeline', () => {
  let lectureContext = ''
  let catalogEquations: Array<{
    id: string
    latex: string
    label: string
    triggers: string[]
    display: boolean
  }> = []

  it('Step 1 — extracts text from an OS lecture PPTX', async () => {
    const pptxBuf = await createTestPptx(OS_SLIDE_TEXT)

    const res = await post('/api/extract-pptx', null, {
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      rawBody: pptxBuf,
    })

    expect(res.status).toBe(200)
    const { text } = (await res.json()) as { text: string }
    expect(text).toContain('page tables')
    expect(text).toContain('vaddr')
    lectureContext = text
  })

  it.skipIf(!hasKey)('Step 2 — builds an equation catalog from the lecture text', async () => {
    expect(lectureContext.length).toBeGreaterThan(0)

    const res = await post('/api/equation-catalog', { text: lectureContext })
    expect(res.status).toBe(200)

    const { equations } = (await res.json()) as { equations: typeof catalogEquations }
    expect(Array.isArray(equations)).toBe(true)

    catalogEquations = equations
    if (equations.length > 0) {
      const eq = equations[0]
      expect(typeof eq.id).toBe('string')
      expect(typeof eq.latex).toBe('string')
    }
  })

  it.skipIf(!hasKey)(
    'Step 3 — fixes typos in OS notes without corrupting domain vocab',
    async () => {
      const note =
        'The vaddr is translatd thorugh the TLB. ' +
        'On a TLB mss, the OS walsk the page tabel to find the paddr.'

      const res = await post('/api/correct', { text: note, context: lectureContext })
      expect(res.status).toBe(200)

      const { corrected } = (await res.json()) as { corrected: string }
      expect(corrected).toMatch(/vaddr/)
      expect(corrected).toMatch(/TLB/)
      expect(corrected).toMatch(/paddr/)
      expect(corrected).toMatch(/translated/i)
      expect(corrected).toMatch(/through/i)
    }
  )

  it.skipIf(!hasKey)(
    'Step 4, converts NL markup shorthand using lecture context',
    async () => {
      const res = await post('/api/nl-to-markdown', {
        text: '(checkbox) review page table implementation',
        context: lectureContext,
      })
      expect(res.status).toBe(200)

      const { markdown } = (await res.json()) as { markdown: string }
      expect(markdown).toMatch(/- \[ \]/)
      expect(markdown).toContain('page table')
    }
  )

  it.skipIf(!hasKey)('Step 5 — improves ASCII turnaround formula to LaTeX', async () => {
    const res = await post('/api/improve-latex', {
      math: 'T_avg = (T1 + T2 + ... + Tn) / n',
      context: lectureContext,
    })
    expect(res.status).toBe(200)

    const { improved } = (await res.json()) as { improved: string }
    expect(improved).toMatch(/\\frac|T_|_{avg}/)
    expect(improved).not.toMatch(/^\$/)
  })

  it.skipIf(!hasKey)(
    'Step 6 — suggests a catalog equation when note discusses the same concept',
    async () => {
      if (catalogEquations.length === 0) {
        return
      }

      const res = await post('/api/suggest-equation', {
        recentText:
          'When computing the average turnaround time for processes, we sum the individual times and divide by n.',
        equations: catalogEquations,
      })
      expect(res.status).toBe(200)

      const body = (await res.json()) as {
        match: boolean
        id?: string
        latex?: string
        label?: string
        display?: boolean
      }
      expect(typeof body.match).toBe('boolean')
      if (body.match) {
        expect(typeof body.id).toBe('string')
        expect(typeof body.latex).toBe('string')
        expect(typeof body.display).toBe('boolean')
      }
    }
  )
})
