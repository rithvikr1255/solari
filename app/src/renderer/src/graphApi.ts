import { SOLARI_API } from './equationCatalogApi'
import { setGraphData, type GraphNode, type GraphEdge } from './graphContext'

export async function fetchGraph(): Promise<void> {
  const res = await fetch(`${SOLARI_API}/api/graph`)
  if (!res.ok) return
  const data = (await res.json()) as { nodes: GraphNode[]; edges: GraphEdge[] }
  setGraphData(data.nodes ?? [], data.edges ?? [])
}

export async function upsertNote(id: string, title: string, content: string): Promise<void> {
  await fetch(`${SOLARI_API}/api/graph/note`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, title, content }),
  })
  await fetchGraph()
}

export async function deleteGraphNote(id: string): Promise<void> {
  await fetch(`${SOLARI_API}/api/graph/note/${encodeURIComponent(id)}`, { method: 'DELETE' })
  await fetchGraph()
}
