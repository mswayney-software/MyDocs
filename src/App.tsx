export const APP_NAME = 'Open Writer'

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <span className="file-name">Untitled document</span>
      </header>
      <main className="workspace">
        <div className="sheet" role="textbox" aria-label="Document" aria-multiline="true" />
      </main>
      <footer className="statusbar">
        <span>{APP_NAME}</span>
      </footer>
    </div>
  )
}
