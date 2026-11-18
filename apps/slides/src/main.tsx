import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@mysuite/core/offline'
import '@mysuite/core/fonts.css'
import '@mysuite/core/styles.css'
import './index.css'
import { applyTheme, loadTheme } from '@mysuite/core/appearance'
import App from './App.tsx'

// Before the first paint, so a dark-mode student never sees a white flash.
applyTheme(loadTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
