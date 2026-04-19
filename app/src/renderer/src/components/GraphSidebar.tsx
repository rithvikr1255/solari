import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  getGraphSnapshot,
  subscribeGraph,
  setGraphOpen,
  type GraphEdge,
  type GraphNode,
} from '../graphContext'
import { fetchGraph } from '../graphApi'

const W = 300
const H = 420
const NODE_R = 18

type NodePos = { x: number; y: number; vx: number; vy: number }

function runPhysicsTick(pos: Map<string, NodePos>, edges: GraphEdge[]) {
  const REPULSION = 3000
  const SPRING_K = 0.04
  const REST_LEN = 110
  const GRAVITY = 0.008
  const DAMPING = 0.82
  const cx = W / 2
  const cy = H / 2
  const ids = [...pos.keys()]

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = pos.get(ids[i])!
      const b = pos.get(ids[j])!
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.max(Math.sqrt(dx * dx + dy * dy), 8)
      const f = REPULSION / (d * d)
      const fx = (f * dx) / d
      const fy = (f * dy) / d
      a.vx -= fx
      a.vy -= fy
      b.vx += fx
      b.vy += fy
    }
  }

  for (const e of edges) {
    const a = pos.get(e.from)
    const b = pos.get(e.to)
    if (!a || !b) continue
    const dx = b.x - a.x
    const dy = b.y - a.y
    const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
    const f = SPRING_K * (d - REST_LEN)
    const fx = (f * dx) / d
    const fy = (f * dy) / d
    a.vx += fx
    a.vy += fy
    b.vx -= fx
    b.vy -= fy
  }

  for (const [, p] of pos) {
    p.vx += GRAVITY * (cx - p.x)
    p.vy += GRAVITY * (cy - p.y)
    p.vx *= DAMPING
    p.vy *= DAMPING
    p.x = Math.max(NODE_R + 4, Math.min(W - NODE_R - 4, p.x + p.vx))
    p.y = Math.max(NODE_R + 4, Math.min(H - NODE_R - 4, p.y + p.vy))
  }
}

function initPositions(nodes: GraphNode[], existing: Map<string, NodePos>): Map<string, NodePos> {
  const next = new Map<string, NodePos>()
  nodes.forEach((n, i) => {
    const prev = existing.get(n.id)
    if (prev) {
      next.set(n.id, { ...prev })
    } else {
      // Spread new nodes on a circle so they don't all start at the centre
      const angle = (i / Math.max(nodes.length, 1)) * 2 * Math.PI
      const r = Math.min(W, H) * 0.28
      next.set(n.id, {
        x: W / 2 + r * Math.cos(angle),
        y: H / 2 + r * Math.sin(angle),
        vx: 0,
        vy: 0,
      })
    }
  })
  return next
}

export default function GraphSidebar() {
  const { nodes, edges, open } = useSyncExternalStore(
    subscribeGraph,
    getGraphSnapshot,
    getGraphSnapshot,
  )
  const [refreshing, setRefreshing] = useState(false)
  const [, setTick] = useState(0)

  const posRef = useRef<Map<string, NodePos>>(new Map())
  const tickCountRef = useRef(0)
  const rafRef = useRef(0)

  useEffect(() => {
    fetchGraph().catch(() => {})
  }, [])

  useEffect(() => {
    posRef.current = initPositions(nodes, posRef.current)
    tickCountRef.current = 0
    cancelAnimationFrame(rafRef.current)

    if (nodes.length === 0) return

    function step() {
      if (tickCountRef.current >= 220) return
      tickCountRef.current++
      runPhysicsTick(posRef.current, edges)
      setTick((t) => t + 1)
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [nodes, edges])

  async function refresh() {
    if (refreshing) return
    setRefreshing(true)
    try {
      await fetchGraph()
    } finally {
      setRefreshing(false)
    }
  }

  const pos = posRef.current

  return (
    <div className={`formula-dock graph-dock${open ? ' formula-dock-open' : ''}`}>
      <div
        id="graph-drawer"
        className="side-panel-drawer"
        aria-hidden={!open}
        role="region"
        aria-labelledby="graph-dock-tab"
      >
        <aside className="side-panel">
          <div className="side-panel-header">
            <span className="side-panel-title">
              Knowledge Graph{nodes.length > 0 ? ` (${nodes.length})` : ''}
            </span>
            <div className="graph-header-actions">
              <button
                type="button"
                className="titlebar-btn formula-rescan-btn"
                disabled={refreshing}
                onClick={() => void refresh()}
              >
                {refreshing ? '…' : 'Refresh'}
              </button>
              <button
                type="button"
                className="side-panel-close"
                onClick={() => setGraphOpen(false)}
                aria-label="Hide graph panel"
              >
                ×
              </button>
            </div>
          </div>

          <div className="side-panel-body graph-panel-body">
            {nodes.length === 0 ? (
              <p className="side-panel-empty">
                No notes in graph yet. Use the API to add notes and discover connections.
              </p>
            ) : (
              <svg
                className="graph-canvas"
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="xMidYMid meet"
                aria-label="Knowledge graph visualization"
              >
                <defs>
                  <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="1.8" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {edges.map((e, i) => {
                  const a = pos.get(e.from)
                  const b = pos.get(e.to)
                  if (!a || !b) return null
                  const dx = b.x - a.x
                  const dy = b.y - a.y
                  const d = Math.sqrt(dx * dx + dy * dy) || 1
                  const ox = (dx / d) * NODE_R
                  const oy = (dy / d) * NODE_R
                  const strong = e.strength === 'strong'
                  return (
                    <line
                      key={i}
                      x1={a.x + ox}
                      y1={a.y + oy}
                      x2={b.x - ox}
                      y2={b.y - oy}
                      stroke={strong ? '#7c8cf8' : '#4a507a'}
                      strokeWidth={strong ? 2 : 1}
                      strokeOpacity={strong ? 0.9 : 0.55}
                      strokeDasharray={strong ? undefined : '2 5'}
                      strokeLinecap="round"
                      filter={strong ? 'url(#glow)' : undefined}
                    >
                      <title>{e.label}</title>
                    </line>
                  )
                })}

                {nodes.map((n) => {
                  const p = pos.get(n.id)
                  if (!p) return null
                  const label = n.title.length > 13 ? n.title.slice(0, 12) + '…' : n.title
                  return (
                    <g key={n.id}>
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={NODE_R}
                        fill="#1e1e3f"
                        stroke="#7c8cf8"
                        strokeWidth={1.5}
                      />
                      <text
                        x={p.x}
                        y={p.y + NODE_R + 11}
                        textAnchor="middle"
                        fontSize="9"
                        fill="#b0b8e8"
                        fontFamily="inherit"
                      >
                        {label}
                      </text>
                      <title>{n.title}</title>
                    </g>
                  )
                })}
              </svg>
            )}
          </div>
        </aside>
      </div>

      <button
        type="button"
        className={`formula-dock-tab${open ? ' formula-dock-tab-active' : ''}`}
        onClick={() => setGraphOpen(!open)}
        aria-expanded={open}
        aria-controls="graph-drawer"
        id="graph-dock-tab"
      >
        {nodes.length > 0 ? (
          <span className="formula-dock-badge" aria-hidden="true">
            {nodes.length}
          </span>
        ) : null}
        <span className="formula-dock-tab-text">Graph</span>
      </button>
    </div>
  )
}
