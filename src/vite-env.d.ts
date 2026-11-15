/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set only in `--mode e2e` builds; exposes the editor to Playwright. */
  readonly VITE_E2E?: string
}
