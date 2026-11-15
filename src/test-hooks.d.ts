import type { Editor } from '@tiptap/core'

declare global {
  interface Window {
    /** Test hook, only present in builds made with `--mode e2e`. */
    __openWriter?: Editor
  }
}
