import type { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { normalizeLink } from '../editor/links'
import { fitToPage, imageFileToDataUrl, pickImageFile } from '../files/images'
import type { Ask } from './dialogTypes'

/**
 * Focus the document right now. Tiptap's focus() waits an animation frame, and keys typed
 * in that gap, right after a dialog closes, would be lost.
 */
export function focusNow(editor: Editor) {
  editor.view.focus()
}

/**
 * Bring the editor's selection up to date with the browser's. The browser reports selection
 * changes a moment later, so a shortcut pressed right after a click could act on the old one.
 */
export function syncSelection(editor: Editor) {
  ;(editor.view as unknown as { domObserver?: { flush?: () => void } }).domObserver?.flush?.()
}

export const MAX_TABLE_ROWS = 50
export const MAX_TABLE_COLS = 10

const clampInt = (v: string, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

export async function insertTable(editor: Editor, ask: Ask) {
  const a = await ask({
    title: 'Insert table',
    fields: [
      { key: 'rows', label: 'Rows', value: '3', type: 'number', min: 1, max: MAX_TABLE_ROWS },
      { key: 'cols', label: 'Columns', value: '3', type: 'number', min: 1, max: MAX_TABLE_COLS },
      { key: 'header', label: 'First row is a header', value: 'true', type: 'checkbox' },
    ],
    buttons: [
      { label: 'Cancel', value: 'cancel' },
      { label: 'Insert', value: 'insert', primary: true },
    ],
    cancelValue: 'cancel',
  })
  focusNow(editor)
  if (a.value !== 'insert') return
  editor
    .chain()
    .focus()
    .insertTable({
      rows: clampInt(a.values.rows, 1, MAX_TABLE_ROWS, 3),
      cols: clampInt(a.values.cols, 1, MAX_TABLE_COLS, 3),
      withHeaderRow: a.values.header === 'true',
    })
    .run()
}

/** Ctrl+K: add a link to the selection, edit the link under the cursor, or remove it. */
export async function editLink(editor: Editor, ask: Ask) {
  syncSelection(editor)
  const existing = editor.getAttributes('link').href as string | undefined
  if (existing) editor.chain().extendMarkRange('link').run()
  const { empty } = editor.state.selection

  const a = await ask({
    title: existing ? 'Edit link' : 'Add link',
    fields: [
      ...(empty && !existing ? [{ key: 'text', label: 'Text to show', value: '' }] : []),
      { key: 'href', label: 'Web or email address', value: existing ?? '', placeholder: 'example.com' },
    ],
    buttons: [
      { label: 'Cancel', value: 'cancel' },
      ...(existing ? [{ label: 'Remove link', value: 'remove' }] : []),
      { label: existing ? 'Save' : 'Add link', value: 'apply', primary: true },
    ],
    cancelValue: 'cancel',
  })
  focusNow(editor)
  if (a.value === 'cancel') return
  if (a.value === 'remove') return void editor.chain().focus().extendMarkRange('link').unsetLink().run()

  const href = normalizeLink(a.values.href ?? '')
  if (!href) {
    await ask({
      title: 'That address can’t be a link',
      body: 'Use a web address such as example.com, or an email address.',
      buttons: [{ label: 'OK', value: 'ok', primary: true }],
      cancelValue: 'ok',
    })
    return void focusNow(editor)
  }
  if (empty && !existing) {
    const text = (a.values.text ?? '').trim() || a.values.href.trim()
    editor
      .chain()
      .focus()
      .insertContent({ type: 'text', text, marks: [{ type: 'link', attrs: { href } }] })
      .unsetMark('link') // keep typing after the link as plain text
      .run()
  } else {
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
  }
}

/** Insert image files at `pos` (or the cursor). Returns how many were inserted. */
export async function insertImageFiles(editor: Editor, files: File[], pos?: number): Promise<number> {
  let at = pos
  let count = 0
  for (const file of files) {
    let img
    try {
      img = await imageFileToDataUrl(file)
    } catch {
      continue // unreadable or not an image
    }
    const node = { type: 'image', attrs: { src: img.src, alt: file.name.replace(/\.[^.]+$/, ''), ...fitToPage(img) } }
    const chain = editor.chain().focus()
    if (at !== undefined) chain.insertContentAt(at, node)
    else chain.insertContent(node)
    chain.run()
    at = undefined
    count++
  }
  return count
}

export async function pickAndInsertImage(editor: Editor) {
  const file = await pickImageFile()
  focusNow(editor)
  if (file) await insertImageFiles(editor, [file])
}

/** The image node under a NodeSelection, if any. */
export function selectedImage(editor: Editor) {
  const sel = editor.state.selection
  return sel instanceof NodeSelection && sel.node.type.name === 'image' ? sel.node : null
}
