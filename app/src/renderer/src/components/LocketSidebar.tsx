import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  getLocketSnapshot,
  subscribeLocket,
  setLocketFolder,
  setLocketFiles,
  setActiveFile,
  setLocketOpen,
} from '../locketContext'
import { getEditorView } from '../editorBridge'
import { upsertNote, deleteGraphNote } from '../graphApi'

async function loadFolder(folderPath: string) {
  const files = await window.api.listFolder(folderPath)
  setLocketFiles(files)
  return files
}

async function switchToNote(folderPath: string, fileName: string, currentFile: string | null) {
  const view = getEditorView()
  if (view && currentFile && currentFile !== fileName) {
    const content = view.state.doc.toString()
    await window.api.saveFile(`${folderPath}/${currentFile}`, content)
    await upsertNote(currentFile, currentFile.replace(/\.md$/, ''), content)
  }
  const newContent = await window.api.readNote(folderPath, fileName)
  const v = getEditorView()
  if (v) {
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: newContent } })
  }
  setActiveFile(fileName)
}

export default function LocketSidebar() {
  const { folderPath, files, activeFile, open } = useSyncExternalStore(
    subscribeLocket,
    getLocketSnapshot,
    getLocketSnapshot,
  )
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [saveLabel, setSaveLabel] = useState<'idle' | 'saved' | 'error'>('idle')
  const searchRef = useRef<HTMLInputElement>(null)
  const newNoteRef = useRef<HTMLInputElement>(null)

  const filtered = query.trim()
    ? files.filter((f) => f.toLowerCase().includes(query.toLowerCase()))
    : files

  // Auto-load ~/Documents/Solari Locket on mount
  useEffect(() => {
    window.api.getLocketPath().then(async (dir) => {
      setLocketFolder(dir)
      const fileList = await loadFolder(dir)
      setLocketOpen(true)
      if (fileList.length > 0) {
        await switchToNote(dir, fileList[0], null)
      }
    })
  }, [])

  // Focus the new-note input whenever it becomes visible
  useEffect(() => {
    if (creating) setTimeout(() => newNoteRef.current?.focus(), 0)
  }, [creating])

  // Menu-driven hotkeys via IPC
  useEffect(() => {
    const off = window.api.onLocketHotkey((action) => {
      const { folderPath: fp, activeFile: af } = getLocketSnapshot()

      if (action === 'save') {
        if (!fp || !af) return
        const view = getEditorView()
        if (!view) return
        const content = view.state.doc.toString()
        void window.api.saveFile(`${fp}/${af}`, content)
          .then(() => upsertNote(af, af.replace(/\.md$/, ''), content))
          .then(() => {
            setSaveLabel('saved')
            setTimeout(() => setSaveLabel('idle'), 1500)
          })
          .catch(() => setSaveLabel('error'))

      } else if (action === 'new-note') {
        setLocketOpen(true)
        setCreating(true)

      } else if (action === 'search') {
        setLocketOpen(true)
        setTimeout(() => searchRef.current?.focus(), 220)
      }
    })
    return off
  }, [])

  async function commitNewNote() {
    const { folderPath: fp, activeFile: af } = getLocketSnapshot()
    let name = draftName.trim()
    if (!name || !fp) { setCreating(false); setDraftName(''); return }
    if (!name.endsWith('.md')) name += '.md'
    setCreating(false)
    setDraftName('')
    try {
      await window.api.createNote(fp, name)
      const updated = await loadFolder(fp)
      if (updated.includes(name)) await switchToNote(fp, name, af)
    } catch {
      // file already exists — just switch to it if present
      const current = getLocketSnapshot().files
      if (current.includes(name)) await switchToNote(fp, name, af)
    }
  }

  async function deleteNote(fileName: string) {
    const { folderPath: fp, activeFile: af } = getLocketSnapshot()
    if (!fp) return
    // Use IPC-based confirm since window.confirm may be unreliable in Electron
    const ok = await window.api.confirm(`Delete "${fileName}"? This cannot be undone.`)
    if (!ok) return
    await window.api.deleteNote(fp, fileName)
    await deleteGraphNote(fileName)
    const updated = await loadFolder(fp)
    if (af === fileName) {
      const view = getEditorView()
      if (updated.length > 0) {
        await switchToNote(fp, updated[0], null)
      } else {
        view?.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '' } })
        setActiveFile(null)
      }
    }
  }

  const shortPath = folderPath ? folderPath.split('/').slice(-2).join('/') : null

  return (
    <div className={`locket-dock${open ? ' locket-dock-open' : ''}`}>
      <button
        type="button"
        className={`formula-dock-tab locket-tab${open ? ' formula-dock-tab-active' : ''}`}
        onClick={() => setLocketOpen(!open)}
        aria-expanded={open}
        aria-controls="locket-drawer"
        id="locket-dock-tab"
      >
        {files.length > 0 ? (
          <span className="formula-dock-badge" aria-hidden="true">
            {files.length}
          </span>
        ) : null}
        <span className="formula-dock-tab-text">Locket</span>
      </button>

      <div
        id="locket-drawer"
        className="side-panel-drawer locket-drawer"
        aria-hidden={!open}
        role="region"
        aria-labelledby="locket-dock-tab"
      >
        <aside className="side-panel">
          <div className="side-panel-header">
            <span className="side-panel-title">
              Locket
              {saveLabel === 'saved' && <span className="locket-save-label"> · Saved</span>}
              {saveLabel === 'error' && <span className="locket-save-label locket-save-error"> · Error</span>}
            </span>
            <button
              type="button"
              className="side-panel-close"
              onClick={() => setLocketOpen(false)}
              aria-label="Hide locket panel"
            >
              ×
            </button>
          </div>

          <div className="side-panel-body">
            <div className="locket-actions">
              <button
                type="button"
                className="titlebar-btn"
                onClick={() => setCreating(true)}
              >
                New note
              </button>
            </div>

            {shortPath ? (
              <div className="locket-folder-path" title={folderPath ?? undefined}>
                {shortPath}
              </div>
            ) : null}

            {creating ? (
              <div className="locket-new-note-form">
                <input
                  ref={newNoteRef}
                  type="text"
                  className="locket-search"
                  placeholder="Note name…"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void commitNewNote()
                    if (e.key === 'Escape') { setCreating(false); setDraftName('') }
                  }}
                />
              </div>
            ) : null}

            {files.length > 0 ? (
              <input
                ref={searchRef}
                type="text"
                className="locket-search"
                placeholder="Search notes… (⌘O)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
              />
            ) : null}

            {files.length === 0 && !creating ? (
              <p className="side-panel-empty">No markdown files yet. Press ⌘N to create one.</p>
            ) : filtered.length === 0 && query ? (
              <p className="side-panel-empty">No notes match "{query}".</p>
            ) : (
              <ul className="locket-file-list">
                {filtered.map((f) => (
                  <li
                    key={f}
                    className={`locket-file-item${f === activeFile ? ' locket-file-item-active' : ''}`}
                    onClick={() => void switchToNote(folderPath!, f, activeFile)}
                  >
                    <span className="locket-file-name">{f.replace(/\.md$/, '')}</span>
                    <button
                      type="button"
                      className="locket-file-delete"
                      aria-label={`Delete ${f}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        void deleteNote(f)
                      }}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
