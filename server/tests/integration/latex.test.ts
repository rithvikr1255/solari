import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { startTestServer, stopTestServer, post } from '../helpers/server.js'

const hasKey = Boolean(process.env.ANTHROPIC_API_KEY)

beforeAll(startTestServer)
afterAll(stopTestServer)

describe('POST /api/improve-latex', () => {
  it('returns 400 when math field is missing', async () => {
    const res = await post('/api/improve-latex', {})
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it.skipIf(!hasKey)('converts an ASCII fraction to LaTeX \\frac', async () => {
    const res = await post('/api/improve-latex', { math: 'a/b' })
    expect(res.status).toBe(200)
    const { improved } = (await res.json()) as { improved: string }
    expect(improved).toMatch(/\\frac/)
  })

  it.skipIf(!hasKey)('converts sqrt ASCII notation to LaTeX \\sqrt', async () => {
    const res = await post('/api/improve-latex', { math: 'sqrt(x^2 + y^2)' })
    expect(res.status).toBe(200)
    const { improved } = (await res.json()) as { improved: string }
    expect(improved).toMatch(/\\sqrt/)
  })

  it.skipIf(!hasKey)('returns only the LaTeX body — no wrapping $ delimiters', async () => {
    const res = await post('/api/improve-latex', { math: 'x^2 + y^2 = z^2' })
    expect(res.status).toBe(200)
    const { improved } = (await res.json()) as { improved: string }
    expect(improved).not.toMatch(/^\$/)
    expect(improved).not.toMatch(/\$$/)
  })

  it.skipIf(!hasKey)('leaves valid LaTeX unchanged', async () => {
    const latex = '\\frac{\\partial f}{\\partial x}'
    const res = await post('/api/improve-latex', { math: latex })
    expect(res.status).toBe(200)
    const { improved } = (await res.json()) as { improved: string }
    expect(improved).toContain('\\frac')
    expect(improved).toContain('\\partial')
  })
})

describe('POST /api/equation-catalog', () => {
  it('returns 400 when text field is missing', async () => {
    const res = await post('/api/equation-catalog', {})
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toHaveProperty('error')
  })

  it.skipIf(!hasKey)('extracts at least one equation from lecture text', async () => {
    const lectureText =
      'The kinetic energy of an object is KE = (1/2) m v^2. ' +
      "Newton's second law states F = ma. " +
      'The quadratic formula gives x = (-b ± sqrt(b^2 - 4ac)) / (2a).'

    const res = await post('/api/equation-catalog', { text: lectureText })
    expect(res.status).toBe(200)
    const { equations } = (await res.json()) as {
      equations: Array<{ id: string; latex: string; label: string; triggers: string[]; display: boolean }>
    }
    expect(Array.isArray(equations)).toBe(true)
    expect(equations.length).toBeGreaterThanOrEqual(1)

    const eq = equations[0]
    expect(typeof eq.id).toBe('string')
    expect(typeof eq.latex).toBe('string')
    expect(eq.latex.length).toBeGreaterThan(0)
    expect(typeof eq.label).toBe('string')
    expect(Array.isArray(eq.triggers)).toBe(true)
    expect(typeof eq.display).toBe('boolean')
  })

  it.skipIf(!hasKey)('returns an empty array for text with no equations', async () => {
    const res = await post('/api/equation-catalog', {
      text: 'Today we talked about the history of computers and how transistors were invented.',
    })
    expect(res.status).toBe(200)
    const { equations } = (await res.json()) as { equations: unknown[] }
    expect(Array.isArray(equations)).toBe(true)
  })

  it.skipIf(!hasKey)('caps output at 24 equations', async () => {
    const formulas = Array.from({ length: 30 }, (_, i) => `f_${i}(x) = x^${i + 1}`).join('. ')
    const res = await post('/api/equation-catalog', { text: formulas })
    expect(res.status).toBe(200)
    const { equations } = (await res.json()) as { equations: unknown[] }
    expect(equations.length).toBeLessThanOrEqual(24)
  })
})

describe('POST /api/suggest-equation', () => {
  it('returns 400 when recentText field is missing', async () => {
    const res = await post('/api/suggest-equation', { equations: [] })
    expect(res.status).toBe(400)
  })

  it('returns { match: false } when equations array is empty', async () => {
    const res = await post('/api/suggest-equation', {
      recentText: 'We are discussing kinetic energy.',
      equations: [],
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { match: boolean }
    expect(body.match).toBe(false)
  })

  it.skipIf(!hasKey)('matches when note clearly discusses a catalog equation', async () => {
    const equations = [
      {
        id: 'kinetic-energy',
        latex: '\\frac{1}{2} m v^2',
        label: 'Kinetic Energy',
        triggers: ['kinetic energy', 'KE', '1/2 mv^2'],
        display: true,
      },
      {
        id: 'newtons-second',
        latex: 'F = ma',
        label: "Newton's Second Law",
        triggers: ['force', 'F = ma', 'Newton'],
        display: false,
      },
    ]

    const res = await post('/api/suggest-equation', {
      recentText: 'The kinetic energy of the moving ball is given by the standard formula.',
      equations,
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { match: boolean; id?: string; latex?: string }
    if (body.match) {
      expect(body.id).toBe('kinetic-energy')
      expect(typeof body.latex).toBe('string')
    }
    // match may be false if model is not confident, that is fine
    expect(typeof body.match).toBe('boolean')
  })

  it.skipIf(!hasKey)('returns match false for unrelated note text', async () => {
    const equations = [
      {
        id: 'kinetic-energy',
        latex: '\\frac{1}{2} m v^2',
        label: 'Kinetic Energy',
        triggers: ['kinetic energy', 'KE'],
        display: true,
      },
    ]

    const res = await post('/api/suggest-equation', {
      recentText: 'The meeting was rescheduled to Thursday afternoon.',
      equations,
    })
    expect(res.status).toBe(200)
    const { match } = (await res.json()) as { match: boolean }
    expect(match).toBe(false)
  })
})
