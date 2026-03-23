import { useRef, useState, useSyncExternalStore } from 'react'
import SolariEditor from './components/SolariEditor'
import {
  clearReference,
  getReferenceSnapshot,
  setReference,
  subscribe
} from './referenceContext'

const API = 'http://localhost:3001'

export default function App() {
  const fileRef = useRef<HTMLInputElement>(null)
  const refState = useSyncExternalStore(subscribe, getReferenceSnapshot, getReferenceSnapshot)
  const [loading, setLoading] = useState(false)

  async function onPickPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLoading(true)
    try {
      const buf = await file.arrayBuffer()
      const res = await fetch(`${API}/api/extract-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf' },
        body: buf
      })
      if (!res.ok) return
      const data = (await res.json()) as { text: string }
      if (data.text) setReference(data.text, file.name)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <header className="titlebar">
        <span className="app-name">Solari</span>
        <div className="titlebar-actions">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            className="titlebar-file-input"
            onChange={onPickPdf}
          />
          <button
            type="button"
            className="titlebar-btn"
            disabled={loading}
            onClick={() => fileRef.current?.click()}
          >
            {loading ? '…' : 'Reference PDF'}
          </button>
          {refState.text ? (
            <>
              <span className="titlebar-ref" title={refState.label}>
                {refState.label || 'Attached'} · {refState.text.length.toLocaleString()} chars
              </span>
              <button type="button" className="titlebar-btn" onClick={() => clearReference()}>
                Clear
              </button>
            </>
          ) : null}
        </div>
      </header>
      <main className="editor-area">
        <SolariEditor />
      </main>
    </div>
  )
}
