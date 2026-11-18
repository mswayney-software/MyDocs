/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set only in `--mode e2e` builds; exposes test hooks to Playwright. */
  readonly VITE_E2E?: string
}
