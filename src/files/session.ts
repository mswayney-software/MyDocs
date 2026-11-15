import type { Editor, JSONContent } from '@tiptap/core'
import { Node as PMNode } from '@tiptap/pm/model'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import {
  appendHistory, deleteDocument, findRecoverable, HISTORY_INTERVAL_MS, holdLock, requestPersistentStorage,
  writeSnapshot,
} from '../storage/autosave'
import { canWriteBack, openFile, saveFile } from './fileAccess'
import type { Ask } from '../ui/dialogTypes'
import { baseName, DEFAULT_PAGE, FILE_EXTENSION, OpenError, parse, safeFileName, serialize, type PageSettings } from './native'

/** Backups are written at most this long after a change, so a crash loses under 2 seconds. */
export const BACKUP_DELAY_MS = 1000
export const UNTITLED = 'Untitled document'

export type { Ask, DialogAnswer, DialogSpec } from '../ui/dialogTypes'

export interface SessionState {
  fileName: string
  /** Changes not yet saved to a file. */
  dirty: boolean
  /** The document has been saved to or opened from a file at least once. */
  hasFile: boolean
  /** A short message shown next to the file name, such as "Saved". */
  notice: string | null
  /** Paper, margins, header, footer, and page numbers. */
  page: PageSettings
}

const newId = () => crypto.randomUUID()
let recoveryChecked = false

/**
 * One open document: its file, its saved state, and its local backup.
 * Side effects start in start() and stop in dispose(), so React StrictMode can run both twice.
 */
export class DocumentSession {
  private id: string = newId()
  private releaseLock: () => void = () => {}
  private handle: FileSystemFileHandle | null = null
  /** Page settings as last saved to or opened from a file. */
  private savedPage = JSON.stringify(DEFAULT_PAGE)
  /** Document as last saved to or opened from a file; null = never matches (unsaved new or recovered). */
  private savedDoc: PMNode | null
  private backupTimer: ReturnType<typeof setTimeout> | null = null
  private noticeTimer: ReturnType<typeof setTimeout> | null = null
  private lastHistoryAt = 0
  private writing: Promise<void> = Promise.resolve()
  private askedForPersistence = false
  private state: SessionState = {
    fileName: UNTITLED,
    dirty: false,
    hasFile: false,
    notice: null,
    page: structuredClone(DEFAULT_PAGE),
  }
  private listeners = new Set<() => void>()
  private readonly editor: Editor
  private readonly ask: Ask

  constructor(editor: Editor, ask: Ask) {
    this.editor = editor
    this.ask = ask
    this.savedDoc = editor.state.doc
  }

  // ---- React glue -------------------------------------------------------------------

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getState = () => this.state

  private setState(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch }
    document.title = `${this.state.fileName} - Open Writer`
    this.listeners.forEach((fn) => fn())
  }

  // ---- lifecycle ----------------------------------------------------------------------

  start() {
    this.releaseLock = holdLock(this.id)
    this.editor.on('update', this.onUpdate)
    window.addEventListener('beforeunload', this.onBeforeUnload)
    window.addEventListener('pagehide', this.flush)
    document.addEventListener('visibilitychange', this.onVisibility)
    this.setState({})
    if (!recoveryChecked) {
      recoveryChecked = true
      void this.offerRecovery()
    }
  }

  dispose() {
    this.flush()
    this.releaseLock()
    this.editor.off('update', this.onUpdate)
    window.removeEventListener('beforeunload', this.onBeforeUnload)
    window.removeEventListener('pagehide', this.flush)
    document.removeEventListener('visibilitychange', this.onVisibility)
  }

  private isDirty() {
    return (
      this.savedDoc === null ||
      !this.editor.state.doc.eq(this.savedDoc) ||
      JSON.stringify(this.state.page) !== this.savedPage
    )
  }

  private onUpdate = () => {
    const dirty = this.isDirty()
    if (dirty !== this.state.dirty) this.setState({ dirty })
    if (!this.askedForPersistence) {
      this.askedForPersistence = true
      void requestPersistentStorage()
    }
    this.scheduleBackup()
  }

  private onBeforeUnload = (e: BeforeUnloadEvent) => {
    this.flush()
    if (this.state.dirty) {
      e.preventDefault()
      e.returnValue = '' // Chrome needs this to show the "leave site?" prompt
    }
  }

  private onVisibility = () => {
    if (document.visibilityState === 'hidden') this.flush()
  }

  // ---- backup -------------------------------------------------------------------------

  private scheduleBackup() {
    if (this.backupTimer) return // throttle, not debounce: continuous typing still backs up
    this.backupTimer = setTimeout(() => void this.backup(), BACKUP_DELAY_MS)
  }

  /** Write any pending backup now. */
  flush = () => {
    if (this.backupTimer) void this.backup()
  }

  private backup(): Promise<void> {
    if (this.backupTimer) clearTimeout(this.backupTimer)
    this.backupTimer = null
    const now = Date.now()
    const data = this.serialize()
    const snap = {
      id: this.id,
      fileName: this.state.fileName,
      data,
      at: now,
      unsaved: this.state.dirty,
      handle: this.handle,
    }
    const addHistory = now - this.lastHistoryAt >= HISTORY_INTERVAL_MS
    if (addHistory) this.lastHistoryAt = now
    // Chain writes so an older backup never lands after a newer one.
    this.writing = this.writing
      .then(async () => {
        await writeSnapshot(snap)
        if (addHistory) await appendHistory(snap.id, { at: now, data })
      })
      .catch((err) => console.error('Backup failed', err))
    return this.writing
  }

  private serialize() {
    return serialize({ page: this.state.page, doc: this.editor.getJSON() })
  }

  // ---- page settings ------------------------------------------------------------------

  /** Change page settings. Counts as an unsaved change and is backed up like typing. */
  setPage(page: PageSettings) {
    if (JSON.stringify(page) === JSON.stringify(this.state.page)) return
    this.setState({ page })
    this.onUpdate()
  }

  // ---- file actions -------------------------------------------------------------------

  // File actions run one at a time. Each one awaits dialogs and storage, and a second action
  // started in that gap (Ctrl+O right after "Don't save") would act on a half-replaced document.
  private busy = false
  private async exclusive<T>(fn: () => Promise<T>, idle: T): Promise<T> {
    if (this.busy) return idle
    this.busy = true
    try {
      return await fn()
    } finally {
      this.busy = false
    }
  }

  save(): Promise<boolean> {
    return this.exclusive(() => this.doSave(), false)
  }
  saveAs(): Promise<boolean> {
    return this.exclusive(() => this.doSaveAs(), false)
  }
  open(): Promise<void> {
    return this.exclusive(() => this.doOpen(), undefined)
  }
  openLaunchedFile(handle: FileSystemFileHandle): Promise<void> {
    return this.exclusive(() => this.doOpenLaunchedFile(handle), undefined)
  }
  newDocument(): Promise<void> {
    return this.exclusive(() => this.doNewDocument(), undefined)
  }

  private async doSave(): Promise<boolean> {
    if (!this.handle && !canWriteBack && !this.state.hasFile) return this.doSaveAs()
    return this.writeFile(this.handle)
  }

  private async doSaveAs(): Promise<boolean> {
    if (!canWriteBack) {
      // No save dialog in this browser: ask for a name, then download.
      const answer = await this.ask({
        title: 'Save as',
        body: 'Firefox and Safari save by downloading a copy to your Downloads folder.',
        fields: [{ key: 'name', label: 'File name', value: this.state.fileName, suffix: FILE_EXTENSION }],
        buttons: [
          { label: 'Cancel', value: 'cancel' },
          { label: 'Download', value: 'save', primary: true },
        ],
        cancelValue: 'cancel',
      })
      if (answer.value !== 'save') return false
      this.setState({ fileName: safeFileName(answer.values.name ?? '') })
    }
    return this.writeFile(null)
  }

  private async writeFile(handle: FileSystemFileHandle | null): Promise<boolean> {
    const doc = this.editor.state.doc
    const page = JSON.stringify(this.state.page)
    const result = await saveFile(this.serialize(), this.state.fileName + FILE_EXTENSION, handle)
    if (result.kind === 'cancelled') return false
    this.savedDoc = doc
    this.savedPage = page
    if (result.kind === 'written') {
      this.handle = result.handle
      this.setState({ fileName: baseName(result.name), hasFile: true })
      this.notify('Saved')
    } else {
      this.setState({ hasFile: true })
      this.notify('Downloaded a copy to your Downloads folder. This browser cannot save over the original file.', 8000)
    }
    // Changes typed while the file was being written still count as unsaved.
    this.setState({ dirty: this.isDirty() })
    await this.backup()
    return true
  }

  private async doOpen(): Promise<void> {
    if (!(await this.confirmLeave())) return
    let file
    try {
      file = await openFile()
    } catch {
      await this.showError('Could not open the file', 'The browser could not read that file.')
      return
    }
    if (!file) return
    await this.loadFile(file)
  }

  /** Open a file the installed app was launched with (double-clicked in the file manager). */
  private async doOpenLaunchedFile(handle: FileSystemFileHandle): Promise<void> {
    if (!(await this.confirmLeave())) return
    let file
    try {
      const f = await handle.getFile()
      file = { name: f.name, text: await f.text(), handle }
    } catch {
      await this.showError('Could not open the file', 'The file could not be read. It may have been moved or deleted.')
      return
    }
    await this.loadFile(file)
  }

  private async loadFile(file: { name: string; text: string; handle: FileSystemFileHandle | null }) {
    let parsed
    try {
      parsed = parse(file.text, this.editor.schema)
    } catch (err) {
      const message = err instanceof OpenError ? err.message : 'The file could not be opened.'
      await this.showError(`Could not open "${file.name}"`, message)
      return
    }
    const cleanup = this.detachCurrent()
    this.load({ doc: parsed.doc, page: parsed.page, fileName: baseName(file.name), handle: file.handle, saved: true })
    await cleanup()
  }

  private async doNewDocument(): Promise<void> {
    if (!(await this.confirmLeave())) return
    const cleanup = this.detachCurrent()
    this.load({ doc: { type: 'doc', content: [{ type: 'paragraph' }] }, page: structuredClone(DEFAULT_PAGE), fileName: UNTITLED, handle: null, saved: true, hasFile: false })
    await cleanup()
  }

  /** If there are unsaved changes, ask what to do. Resolves false to stay put. */
  private async confirmLeave(): Promise<boolean> {
    if (!this.state.dirty) return true
    const answer = await this.ask({
      title: `Save changes to "${this.state.fileName}"?`,
      body: 'Your changes will be lost if you don’t save them.',
      buttons: [
        { label: 'Cancel', value: 'cancel' },
        { label: 'Don’t save', value: 'discard' },
        { label: 'Save', value: 'save', primary: true },
      ],
      cancelValue: 'cancel',
    })
    if (answer.value === 'save') return (await this.doSave()) && !this.state.dirty
    return answer.value === 'discard'
  }

  /**
   * Stop backing up the current document before another replaces it. Returns the cleanup to
   * run after the swap: if the student discarded unsaved changes, their backup is deleted so
   * it isn't offered later. The swap itself never waits on storage, so keys typed right after
   * New or Open land in the new document.
   */
  private detachCurrent(): () => Promise<void> {
    if (this.backupTimer) clearTimeout(this.backupTimer)
    this.backupTimer = null
    const id = this.id
    const discarded = this.state.dirty
    const pending = this.writing
    return async () => {
      await pending
      if (discarded) await deleteDocument(id)
    }
  }

  private load(opts: {
    doc: JSONContent
    page: PageSettings
    fileName: string
    handle: FileSystemFileHandle | null
    /** Matches a file on disk (opened or new); false for recovered work. */
    saved: boolean
    hasFile?: boolean
    id?: string
  }) {
    this.releaseLock()
    this.id = opts.id ?? newId()
    this.releaseLock = holdLock(this.id)
    this.lastHistoryAt = 0
    this.handle = opts.handle
    this.savedPage = JSON.stringify(opts.page)

    // A fresh editor state: the undo history must not reach back into the previous document.
    const doc = PMNode.fromJSON(this.editor.schema, opts.doc)
    const fresh = EditorState.create({
      doc,
      plugins: this.editor.state.plugins,
      selection: TextSelection.atStart(doc),
    })
    this.editor.view.updateState(fresh)
    this.savedDoc = opts.saved ? doc : null
    this.setState({
      fileName: opts.fileName,
      dirty: !opts.saved,
      hasFile: opts.hasFile ?? (opts.saved || opts.handle !== null),
      notice: null,
      page: opts.page,
    })
    // Let the toolbar and everything else that listens to transactions catch up.
    this.editor.view.dispatch(this.editor.state.tr.setMeta('addToHistory', false))
    this.editor.view.focus() // now, not a frame later: the cursor is already at the start
    if (!opts.saved) void this.backup()
  }

  // ---- recovery -----------------------------------------------------------------------

  private async offerRecovery() {
    let candidates
    try {
      candidates = await findRecoverable()
    } catch {
      return // IndexedDB unavailable (private window in some browsers): nothing to recover
    }
    for (const snap of candidates) {
      const when = new Date(snap.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
      const answer = await this.ask({
        title: 'Recover unsaved work?',
        body: `"${snap.fileName}" has changes from ${when} that were never saved to a file. Restore them, or discard them for good.`,
        buttons: [
          { label: 'Discard', value: 'discard' },
          { label: 'Restore', value: 'restore', primary: true },
        ],
        cancelValue: 'later',
      })
      if (answer.value === 'later') return // dismissed: ask again next time, never discard silently
      if (answer.value === 'discard') {
        await deleteDocument(snap.id)
        continue
      }
      try {
        const parsed = parse(snap.data, this.editor.schema)
        // Work typed before the dialog appeared keeps its own backup (offered next launch);
        // an untouched blank page has nothing worth keeping. The backup captures the text
        // now, so the swap below never waits on storage.
        const oldId = this.id
        const keepOld = this.state.dirty
        if (keepOld) void this.backup()
        this.load({ doc: parsed.doc, page: parsed.page, fileName: snap.fileName, handle: snap.handle, saved: false, id: snap.id })
        if (!keepOld) await deleteDocument(oldId)
      } catch {
        await this.showError('Could not recover', 'That backup is damaged and could not be restored. It has been kept in case it can be recovered later.')
      }
      return // one document per tab
    }
  }

  // ---- messages -----------------------------------------------------------------------

  /** Show a short message next to the file name. */
  notify(message: string, ms = 4000) {
    if (this.noticeTimer) clearTimeout(this.noticeTimer)
    this.setState({ notice: message })
    this.noticeTimer = setTimeout(() => this.setState({ notice: null }), ms)
  }

  private async showError(title: string, body: string) {
    await this.ask({ title, body, buttons: [{ label: 'OK', value: 'ok', primary: true }], cancelValue: 'ok' })
    this.editor.view.focus()
  }
}
