/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set only in `--mode e2e` builds; exposes the editor to Playwright. */
  readonly VITE_E2E?: string
}

/** File Handling API (installed app opened with a file). Chrome and Edge only. */
interface LaunchParams {
  readonly files: readonly FileSystemHandle[]
}
interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void): void
}
