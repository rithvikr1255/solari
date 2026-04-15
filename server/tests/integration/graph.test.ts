import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { startTestServer, stopTestServer, post } from '../helpers/server.js'

const hasKey = Boolean(process.env.ANTHROPIC_API_KEY)

async function del(path: string): Promise<Response> {
  const { url } = await import('../helpers/server.js')
  return fetch(url(path), { method: 'DELETE' })
}

beforeAll(startTestServer)
afterAll(stopTestServer)

describe('GET /api/graph', () => {
  it('returns empty nodes and edges on a fresh store', async () => {
    const res = await fetch((await import('../helpers/server.js')).url('/api/graph'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { nodes: unknown[]; edges: unknown[] }
    expect(Array.isArray(body.nodes)).toBe(true)
    expect(Array.isArray(body.edges)).toBe(true)
  })
})

describe('POST /api/graph/note', () => {
  it('returns 400 when id is missing', async () => {
    const res = await post('/api/graph/note', { title: 'T', content: 'C' })
    expect(res.status).toBe(400)
  })

  it('returns 400 when title is missing', async () => {
    const res = await post('/api/graph/note', { id: 'x', content: 'C' })
    expect(res.status).toBe(400)
  })

  it('returns 400 when content is missing', async () => {
    const res = await post('/api/graph/note', { id: 'x', title: 'T' })
    expect(res.status).toBe(400)
  })

  it('upserts a note and returns an edges array', async () => {
    const res = await post('/api/graph/note', {
      id: 'solo',
      title: 'Solo Note',
      content: 'Just one note with no peers yet.',
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { edges: unknown[] }
    expect(Array.isArray(body.edges)).toBe(true)
    expect(body.edges).toHaveLength(0)
  })

  it('note appears in GET /api/graph nodes after upsert', async () => {
    const { url } = await import('../helpers/server.js')
    const body = (await (await fetch(url('/api/graph'))).json()) as {
      nodes: Array<{ id: string; title: string }>
    }
    expect(body.nodes.some((n) => n.id === 'solo')).toBe(true)
  })
})

describe('DELETE /api/graph/note/:id', () => {
  it('returns 404 for a non-existent note', async () => {
    const res = await del('/api/graph/note/does-not-exist')
    expect(res.status).toBe(404)
  })

  it('removes the note and its edges', async () => {
    await post('/api/graph/note', { id: 'temp', title: 'Temp', content: 'Temporary note.' })
    const res = await del('/api/graph/note/temp')
    expect(res.status).toBe(200)

    const { url } = await import('../helpers/server.js')
    const graph = (await (await fetch(url('/api/graph'))).json()) as {
      nodes: Array<{ id: string }>
      edges: Array<{ from: string; to: string }>
    }
    expect(graph.nodes.some((n) => n.id === 'temp')).toBe(false)
    expect(graph.edges.every((e) => e.from !== 'temp' && e.to !== 'temp')).toBe(true)
  })
})

describe('POST /api/graph/analyze', () => {
  it('returns 400 when notes array is missing', async () => {
    const res = await post('/api/graph/analyze', {})
    expect(res.status).toBe(400)
  })

  it('returns empty edges for a single note', async () => {
    const res = await post('/api/graph/analyze', {
      notes: [{ id: 'a', title: 'A', content: 'Only one note.' }],
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { edges: unknown[] }
    expect(body.edges).toHaveLength(0)
  })

  it.skipIf(!hasKey)('finds edges between two clearly related notes', async () => {
    const res = await post('/api/graph/analyze', {
      notes: [
        {
          id: 'vm',
          title: 'Virtual Memory',
          content:
            'Virtual memory lets each process see its own address space. ' +
            'The OS uses page tables to translate virtual addresses to physical ones.',
        },
        {
          id: 'tlb',
          title: 'TLB Optimization',
          content:
            'The Translation Lookaside Buffer caches recent virtual-to-physical address mappings. ' +
            'A TLB hit avoids a costly page table walk.',
        },
      ],
    })
    expect(res.status).toBe(200)
    const { edges } = (await res.json()) as {
      edges: Array<{ from: string; to: string; label: string; strength: string }>
    }
    expect(Array.isArray(edges)).toBe(true)
    expect(edges.length).toBeGreaterThanOrEqual(1)

    const e = edges[0]
    expect(['vm', 'tlb']).toContain(e.from)
    expect(['vm', 'tlb']).toContain(e.to)
    expect(e.from).not.toBe(e.to)
    expect(typeof e.label).toBe('string')
    expect(['strong', 'weak']).toContain(e.strength)
  })

  it.skipIf(!hasKey)('returns no edges between two unrelated notes', async () => {
    const res = await post('/api/graph/analyze', {
      notes: [
        {
          id: 'recipe',
          title: 'Pasta Recipe',
          content: 'Boil water, add salt, cook pasta for 8 minutes, drain, add sauce.',
        },
        {
          id: 'cs',
          title: 'Binary Search',
          content:
            'Binary search finds an element in a sorted array in O(log n) time by halving the search space each step.',
        },
      ],
    })
    expect(res.status).toBe(200)
    const { edges } = (await res.json()) as { edges: unknown[] }
    expect(edges).toHaveLength(0)
  })
})

describe('POST /api/graph/note — full cycle with two related notes', () => {
  it.skipIf(!hasKey)('edges appear in GET /api/graph after adding two connected notes', async () => {
    await post('/api/graph/note', {
      id: 'sched',
      title: 'CPU Scheduling',
      content:
        'The OS scheduler decides which process runs next. ' +
        'Round-robin assigns each process a time quantum.',
    })
    await post('/api/graph/note', {
      id: 'ctx',
      title: 'Context Switching',
      content:
        'A context switch saves one process state and restores another. ' +
        'Frequent switching is needed for time-sharing and is triggered by the scheduler.',
    })

    const { url } = await import('../helpers/server.js')
    const graph = (await (await fetch(url('/api/graph'))).json()) as {
      nodes: Array<{ id: string }>
      edges: Array<{ from: string; to: string }>
    }

    expect(graph.nodes.some((n) => n.id === 'sched')).toBe(true)
    expect(graph.nodes.some((n) => n.id === 'ctx')).toBe(true)
    expect(
      graph.edges.some(
        (e) =>
          (e.from === 'sched' && e.to === 'ctx') || (e.from === 'ctx' && e.to === 'sched')
      )
    ).toBe(true)
  })
})
