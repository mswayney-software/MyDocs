import { createBackups, HISTORY_INTERVAL_MS, requestPersistentStorage } from '@mysuite/core/backups'
import type { Ask } from '@mysuite/core/dialog-types'
import * as files from '@mysuite/core/file-access'
import { createStore, del, get, keys, set, type UseStore } from 'idb-keyval'
import { produce, type Draft } from 'immer'
import { FILE_DESCRIPTION, FILE_EXTENSION, FILE_MIME, mediaPaths, readDeckFile, writeDeckFile } from './container'
import { newDeck } from './defaults'
import { addMedia, type Media } from './media'
import { deckToJson, OpenError, readDeckJson } from './read'
import type { Deck } from './schema'

/** Backups are written at most this long after a change, so a crash loses under 2 seconds. */
export const BACKUP_DELAY_MS = 1000
export const UNTITLED = 'Untitled deck'

const FILE_TYPES: files.FileTypes = { description: FILE_DESCRIPTION, extensions: [FILE_EXTENSION], mimeTypes: [FILE_MIME] }

/** MySlides' backups. These names are fixed once shipped: students' backups live under them. */
const backups = createBackups({ database: 'myslides', lockPrefix: 'myslides-deck:' })

/**
 * Pictures for backups, stored once each by their content-hash path, never copied per backup.
 * A separate database: idb-keyval keeps one store per database.
 */
let mediaStore: UseStore | null = null
const mediaDb = () => (mediaStore ??= createStore('myslides-media', 'images'))

const MEDIA_IN_TEXT = /media\/[0-9a-f]{16}\.(?:jpg|png|webp|gif)/g

export interface SessionState {
  deck: Deck
  fileName: string
  /** Changes not yet saved to a file. */
  dirty: boolean
  /** The deck has been saved to or opened from a file at least once. */
  hasFile: boolean
  /** A short message shown next to the file name, such as "Saved". */
  notice: string | null
  /** Id of the slide being edited. */
  slideId: string
  canUndo: boolean
  canRedo: boolean
  /** Goes up each time a deck is put in place by New, Open or Restore (not by undo). */
  generation: number
}

/** One undo step: the deck as it was, and the slide that was showing. */
interface HistoryEntry {
  deck: Deck
  slideId: string
}

/**
 * Undo keeps whole decks, not patches: decks are immutable, so consecutive steps share every
 * slide and element that did not change, and a step costs only what it changed.
 */
export const UNDO_LIMIT = 100

const newId = () => crypto.randomUUID()
let recoveryChecked = false

/**
 * One open deck: its file, its saved state, and its local backup. The same rules as MyDocs:
 * backed up within a second of any change, recovery offered for tabs that died, never a silent
 * discard, file actions one at a time.
 * Side effects start in start() and stop in dispose(), so React StrictMode can run both twice.
 */
export class DeckSession {
  private id: string = newId()
  private releaseLock: () => void = () => {}
  private handle: FileSystemFileHandle | null = null
  /** Deck JSON as last saved to or opened from a file; null = never matches (recovered work). */
  private savedJson: string | null
  private media: Media = new Map()
  /** Pictures already in the backup store. */
  private backedUpMedia = new Set<string>()
  private backupTimer: ReturnType<typeof setTimeout> | null = null
  private noticeTimer: ReturnType<typeof setTimeout> | null = null
  private lastHistoryAt = 0
  private writing: Promise<void> = Promise.resolve()
  private askedForPersistence = false
  private state: SessionState
  private listeners = new Set<() => void>()
  private past: HistoryEntry[] = []
  private future: HistoryEntry[] = []
  /** The deck before the drag or resize in progress, if any. */
  private gesture: HistoryEntry | null = null
  private readonly ask: Ask

  constructor(ask: Ask, deck: Deck = newDeck()) {
    this.ask = ask
    this.state = { deck, fileName: UNTITLED, dirty: false, hasFile: false, notice: null, slideId: deck.slides[0].id, canUndo: false, canRedo: false, generation: 0 }
    this.savedJson = deckToJson(deck)
  }

  // ---- React glue -------------------------------------------------------------------

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getState = () => this.state

  private setState(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch }
    document.title = `${this.state.fileName} - MySlides`
    this.listeners.forEach((fn) => fn())
  }

  // ---- lifecycle ----------------------------------------------------------------------

  start() {
    this.releaseLock = backups.holdLock(this.id)
    window.addEventListener('beforeunload', this.onBeforeUnload)
    window.addEventListener('pagehide', this.flush)
    document.addEventListener('visibilitychange', this.onVisibility)
    this.setState({})
    if (!recoveryChecked) {
      recoveryChecked = true
      void this.offerRecovery().then(() => {
        // In the backup queue, so it never runs between a picture being stored and the
        // backup that points at it; the open deck's pictures are always kept.
        this.writing = this.writing
          .then(() => removeUnusedMedia(mediaPaths(this.state.deck)))
          .catch((err) => console.error('Picture cleanup failed', err))
      })
    }
  }

  dispose() {
    this.flush()
    this.releaseLock()
    window.removeEventListener('beforeunload', this.onBeforeUnload)
    window.removeEventListener('pagehide', this.flush)
    document.removeEventListener('visibilitychange', this.onVisibility)
  }

  /** Nothing typed or changed yet: an update may restart the app without asking. */
  isPristine() {
    return !this.state.dirty && !this.state.hasFile
  }

  // ---- changes ------------------------------------------------------------------------

  /**
   * Change the deck: edit the draft in place (Immer) or return a new deck. Each change is one
   * undo step, counts as unsaved, and is backed up within a second. Changes made during a
   * gesture (a drag, a resize) are folded into one step when the gesture ends.
   */
  update(change: (draft: Draft<Deck>) => Deck | void) {
    const before = this.state.deck
    const deck = produce(before, change) as Deck
    if (deck === before) return
    if (!this.gesture) this.pushUndo({ deck: before, slideId: this.state.slideId })
    this.applyDeck(deck, this.state.slideId, !this.gesture)
  }

  /** Start a drag or resize: what follows until endGesture() is one undo step. */
  beginGesture() {
    this.gesture ??= { deck: this.state.deck, slideId: this.state.slideId }
  }

  endGesture() {
    const base = this.gesture
    this.gesture = null
    if (!base || base.deck === this.state.deck) return
    this.pushUndo(base)
    this.applyDeck(this.state.deck, this.state.slideId, true)
  }

  /** Abandon a gesture (Escape mid-drag): the deck goes back to how it was. */
  cancelGesture() {
    const base = this.gesture
    this.gesture = null
    if (base && base.deck !== this.state.deck) this.applyDeck(base.deck, base.slideId, true)
  }

  undo() {
    if (this.gesture) return
    const entry = this.past.pop()
    if (!entry) return
    // Redo shows the slide the change was made on, as undo does.
    this.future.push({ deck: this.state.deck, slideId: entry.slideId })
    this.applyDeck(entry.deck, entry.slideId, true)
  }

  redo() {
    if (this.gesture) return
    const entry = this.future.pop()
    if (!entry) return
    this.past.push({ deck: this.state.deck, slideId: this.state.slideId })
    this.applyDeck(entry.deck, entry.slideId, true)
  }

  /** Show another slide. Not an undo step. */
  goTo(slideId: string) {
    if (slideId !== this.state.slideId && this.state.deck.slides.some((s) => s.id === slideId)) this.setState({ slideId })
  }

  /** The slide being edited. */
  currentSlide() {
    return this.state.deck.slides.find((s) => s.id === this.state.slideId) ?? this.state.deck.slides[0]
  }

  private pushUndo(entry: HistoryEntry) {
    this.past.push(entry)
    if (this.past.length > UNDO_LIMIT) this.past.shift()
    this.future = []
  }

  /** Put a deck in place. `settled` = not mid-gesture: work out exactly whether it is saved. */
  private applyDeck(deck: Deck, slideId: string, settled: boolean) {
    const slide = deck.slides.some((s) => s.id === slideId) ? slideId : deck.slides[0].id
    this.setState({
      deck,
      slideId: slide,
      // Mid-drag the deck changes every frame; comparing it with the saved file then would
      // cost more than it tells. It is worked out once the drag ends.
      dirty: settled ? deckToJson(deck) !== this.savedJson : true,
      canUndo: this.past.length > 0,
      canRedo: this.future.length > 0,
    })
    if (!this.askedForPersistence) {
      this.askedForPersistence = true
      void requestPersistentStorage()
    }
    this.scheduleBackup()
  }

  /** The deck's pictures, by path. */
  getMedia(): Media {
    return this.media
  }

  /** Store a picture (already shrunk) with the deck. Returns the path an image element points at. */
  addPicture(blob: Blob): Promise<string> {
    return addMedia(this.media, blob)
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
    if (this.backupTimer) return // throttle, not debounce: continuous editing still backs up
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
    const deck = this.state.deck
    const data = deckToJson(deck)
    const snap = { id: this.id, fileName: this.state.fileName, data, at: now, unsaved: this.state.dirty, handle: this.handle }
    // Pictures first, each once: a backup never points at a picture that isn't stored.
    const pictures = [...mediaPaths(deck)].filter((p) => !this.backedUpMedia.has(p) && this.media.has(p))
    const addHistory = now - this.lastHistoryAt >= HISTORY_INTERVAL_MS
    if (addHistory) this.lastHistoryAt = now
    // Chain writes so an older backup never lands after a newer one.
    this.writing = this.writing
      .then(async () => {
        for (const path of pictures) {
          await set(path, this.media.get(path)!, mediaDb())
          this.backedUpMedia.add(path)
        }
        await backups.writeSnapshot(snap)
        if (addHistory) await backups.appendHistory(snap.id, { at: now, data })
      })
      .catch((err) => console.error('Backup failed', err))
    return this.writing
  }

  // ---- file actions -------------------------------------------------------------------

  // File actions run one at a time. Each one awaits dialogs and storage, and a second action
  // started in that gap would act on a half-replaced deck.
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
  newDeck(): Promise<void> {
    return this.exclusive(() => this.doNewDeck(), undefined)
  }

  private async doSave(): Promise<boolean> {
    if (!this.handle && !files.canWriteBack && !this.state.hasFile) return this.doSaveAs()
    return this.writeFile(this.handle)
  }

  private async doSaveAs(): Promise<boolean> {
    if (!files.canWriteBack) {
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
      this.setState({ fileName: files.safeFileName(answer.values.name ?? '', UNTITLED) })
    }
    return this.writeFile(null)
  }

  private async writeFile(handle: FileSystemFileHandle | null): Promise<boolean> {
    // The saved time is part of the deck. Set it before writing, so edits made while the file
    // is being written build on it and still count as unsaved afterwards.
    const deck = { ...this.state.deck, meta: { ...this.state.deck.meta, modified: new Date().toISOString() } }
    this.state = { ...this.state, deck }
    let blob: Blob
    try {
      blob = await writeDeckFile(deck, this.media)
    } catch (err) {
      console.error('Could not build the deck file', err)
      await this.showError('Could not save', 'Something went wrong while saving. Your work is still backed up on this device.')
      return false
    }
    const result = await files.saveFile(blob, FILE_TYPES, this.state.fileName + FILE_EXTENSION, handle)
    if (result.kind === 'cancelled') return false
    this.savedJson = deckToJson(deck)
    if (result.kind === 'written') {
      this.handle = result.handle
      this.setState({ fileName: files.baseName(result.name, FILE_EXTENSION), hasFile: true })
      this.notify('Saved')
    } else {
      this.setState({ hasFile: true })
      this.notify('Downloaded a copy to your Downloads folder. This browser cannot save over the original file.', 8000)
    }
    this.setState({ dirty: deckToJson(this.state.deck) !== this.savedJson })
    await this.backup()
    return true
  }

  private async doOpen(): Promise<void> {
    if (!(await this.confirmLeave())) return
    let file
    try {
      file = await files.openFile(FILE_TYPES)
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
      file = { name: f.name, file: f, handle }
    } catch {
      await this.showError('Could not open the file', 'The file could not be read. It may have been moved or deleted.')
      return
    }
    await this.loadFile(file)
  }

  private async loadFile(file: files.OpenedFile) {
    let opened
    try {
      opened = await readDeckFile(file.file)
    } catch (err) {
      const message = err instanceof OpenError ? err.message : 'The file could not be opened.'
      await this.showError(`Could not open "${file.name}"`, message)
      return
    }
    const cleanup = this.detachCurrent()
    this.load({ deck: opened.deck, media: opened.media, fileName: files.baseName(file.name, FILE_EXTENSION), handle: file.handle, saved: true })
    this.inBackground(cleanup)
    if (opened.warnings.length) {
      await this.ask({
        title: `"${file.name}" opened with problems`,
        body: opened.warnings.join(' '),
        buttons: [{ label: 'OK', value: 'ok', primary: true }],
        cancelValue: 'ok',
      })
    }
  }

  private async doNewDeck(): Promise<void> {
    if (!(await this.confirmLeave())) return
    const cleanup = this.detachCurrent()
    this.load({ deck: newDeck(), media: new Map(), fileName: UNTITLED, handle: null, saved: true, hasFile: false })
    this.inBackground(cleanup)
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

  /** Storage cleanup after a swap runs on its own; the next file action never waits for it. */
  private inBackground(task: () => Promise<void>) {
    task().catch((err) => console.error('Cleanup failed', err))
  }

  /**
   * Stop backing up the current deck before another replaces it. Returns the cleanup to run
   * after the swap: discarded unsaved changes lose their backup, so it isn't offered later.
   */
  private detachCurrent(): () => Promise<void> {
    if (this.backupTimer) clearTimeout(this.backupTimer)
    this.backupTimer = null
    const id = this.id
    const discarded = this.state.dirty
    const pending = this.writing
    return async () => {
      await pending
      if (discarded) await backups.deleteDocument(id)
    }
  }

  private load(opts: {
    deck: Deck
    media: Media
    fileName: string
    handle: FileSystemFileHandle | null
    /** Matches a file on disk (opened or new); false for recovered work. */
    saved: boolean
    hasFile?: boolean
    id?: string
  }) {
    this.releaseLock()
    this.id = opts.id ?? newId()
    this.releaseLock = backups.holdLock(this.id)
    this.lastHistoryAt = 0
    this.handle = opts.handle
    this.media = opts.media
    this.backedUpMedia = new Set()
    this.savedJson = opts.saved ? deckToJson(opts.deck) : null
    // Undo never reaches back into another deck.
    this.past = []
    this.future = []
    this.gesture = null
    this.setState({
      deck: opts.deck,
      slideId: opts.deck.slides[0].id,
      canUndo: false,
      canRedo: false,
      generation: this.state.generation + 1,
      fileName: opts.fileName,
      dirty: !opts.saved,
      hasFile: opts.hasFile ?? (opts.saved || opts.handle !== null),
      notice: null,
    })
    if (!opts.saved) void this.backup()
  }

  // ---- recovery -----------------------------------------------------------------------

  private async offerRecovery() {
    let candidates
    try {
      candidates = await backups.findRecoverable()
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
        await backups.deleteDocument(snap.id)
        continue
      }
      try {
        const stored = new Set((await keys(mediaDb())).map(String))
        const { deck } = readDeckJson(snap.data, (src) => stored.has(src))
        const media: Media = new Map()
        for (const path of mediaPaths(deck)) {
          const blob = (await get(path, mediaDb())) as Blob | undefined
          if (blob) media.set(path, blob)
        }
        const oldId = this.id
        const keepOld = this.state.dirty
        if (keepOld) void this.backup()
        this.load({ deck, media, fileName: snap.fileName, handle: snap.handle, saved: false, id: snap.id })
        if (!keepOld) await backups.deleteDocument(oldId)
      } catch {
        await this.showError('Could not recover', 'That backup is damaged and could not be restored. It has been kept in case it can be recovered later.')
      }
      return // one deck per tab
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
  }
}

/** Delete stored pictures that no backup points at any more (spec: Reliability, History). */
async function removeUnusedMedia(keep: Set<string>) {
  const used = new Set(keep)
  for (const data of await backups.allBackupData()) for (const m of data.matchAll(MEDIA_IN_TEXT)) used.add(m[0])
  for (const key of await keys(mediaDb())) if (!used.has(String(key))) await del(key, mediaDb())
}
