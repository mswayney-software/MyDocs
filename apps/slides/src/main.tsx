import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@mysuite/core/offline'
import '@mysuite/core/fonts.css'
import './text/theme-fonts.css'
import '@mysuite/core/styles.css'
import './index.css'
import { applyTheme, loadTheme } from '@mysuite/core/appearance'
import App from './App.tsx'
import { audienceToken } from './present/channel'
import { AudienceApp } from './present/AudienceApp'

// Before the first paint, so a dark-mode student never sees a white flash.
applyTheme(loadTheme())

const token = audienceToken()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Presenter view's second window shows the slide and nothing else. */}
    {token ? <AudienceApp token={token} /> : <App />}
  </StrictMode>,
)
