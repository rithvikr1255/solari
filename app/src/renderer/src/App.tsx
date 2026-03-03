import SolariEditor from './components/SolariEditor'

export default function App() {
  return (
    <div className="app">
      <header className="titlebar">
        <span className="app-name">Solari</span>
      </header>
      <main className="editor-area">
        <SolariEditor />
      </main>
    </div>
  )
}
