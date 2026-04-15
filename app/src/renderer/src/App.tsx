import { useRef, useState, useSyncExternalStore } from 'react'
import SolariEditor from './components/SolariEditor'
import EquationPrompt from './components/EquationPrompt'
import FormulasSidebar from './components/FormulasSidebar'
import GraphSidebar from './components/GraphSidebar'
import LocketSidebar from './components/LocketSidebar'
import { runEquationCatalogScan, SOLARI_API } from './equationCatalogApi'
import { clearReference, getReferenceSnapshot, setReference, subscribe } from './referenceContext'

const API = SOLARI_API

export default function App() {
  const fileRef = useRef<HTMLInputElement>(null)
  const refState = useSyncExternalStore(subscribe, getReferenceSnapshot, getReferenceSnapshot)
  const [loading, setLoading] = useState(false)

  async function onPickReference(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const name = file.name.toLowerCase()
    const isPdf = name.endsWith('.pdf') || file.type === 'application/pdf'
    const isPptx =
      name.endsWith('.pptx') ||
      file.type ===
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    if (!isPdf && !isPptx) return
    setLoading(true)
    try {
      const buf = await file.arrayBuffer()
      const url = isPdf ? `${API}/api/extract-pdf` : `${API}/api/extract-pptx`
      const contentType = isPdf
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body: buf
      })
      if (!res.ok) return
      const data = (await res.json()) as { text: string }
      if (!data.text) return
      setReference(data.text, file.name)
      await runEquationCatalogScan(data.text)
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
            accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            className="titlebar-file-input"
            onChange={onPickReference}
          />
          <button
            type="button"
            className="titlebar-btn"
            disabled={loading}
            onClick={() => fileRef.current?.click()}
          >
            {loading ? '…' : 'Reference doc'}
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
      <div className="workspace">
        <LocketSidebar />
        <main className="editor-area">
          <SolariEditor />
        </main>
        <FormulasSidebar />
        <GraphSidebar />
      </div>
      <EquationPrompt />
    </div>
  )
}
