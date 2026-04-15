export type GraphNode = { id: string; title: string }
export type GraphEdge = { from: string; to: string; label: string; strength: 'strong' | 'weak' }

type State = {
  nodes: GraphNode[]
  edges: GraphEdge[]
  open: boolean
}

let state: State = { nodes: [], edges: [], open: false }
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function subscribeGraph(callback: () => void) {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

export function getGraphSnapshot(): State {
  return state
}

export function setGraphData(nodes: GraphNode[], edges: GraphEdge[]) {
  state = { ...state, nodes, edges }
  emit()
}

export function setGraphOpen(open: boolean) {
  state = { ...state, open }
  emit()
}

export function clearGraph() {
  state = { nodes: [], edges: [], open: state.open }
  emit()
}
