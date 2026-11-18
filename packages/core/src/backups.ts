import { createStore, del, entries, get, set, type UseStore } from 'idb-keyval'

/**
 * Local backup of every open file, in IndexedDB. Nothing here leaves the device.
 * Each app gets its own database and lock names through createBackups().
 *
 * Per document id:
 *   `snap:<id>`  the latest backup (overwritten), written within 2 seconds of any change
 *   `hist:<id>`  the last HISTORY_SIZE backups, one every HISTORY_INTERVAL_MS at most
 *
 * Each open tab holds a Web Lock named after its document id. A backup whose lock is
 * free belongs to a tab that closed or crashed, and is offered for recovery if it holds
 * changes that never reached a file.
 */

export const HISTORY_SIZE = 10
export const HISTORY_INTERVAL_MS = 30_000
/** Keep backups for at most this many documents that have nothing left to recover. */
const MAX_CLEAN_RECORDS = 20

export interface Snapshot {
  id: string
  fileName: string
  /** Serialized native document. */
  data: string
  /** When this backup was taken (ms since epoch). */
  at: number
  /** True if the document had changes not yet saved to a file. */
  unsaved: boolean
  /** Write-back handle (Chrome, Edge), so a recovered document can still save in place. */
  handle: FileSystemFileHandle | null
}

interface HistoryEntry {
  at: number
  data: string
}

export interface BackupNames {
  /** IndexedDB database name. Never change it for a shipped app: old backups live there. */
  database: string
  /** Web Lock name prefix marking a file as open in a live tab. */
  lockPrefix: string
}

export type Backups = ReturnType<typeof createBackups>

export function createBackups({ database, lockPrefix: LOCK_PREFIX }: BackupNames) {
  let store: UseStore | null = null
  const db = () => (store ??= createStore(database, 'backups'))

  async function writeSnapshot(snap: Snapshot): Promise<void> {
    try {
      await set(`snap:${snap.id}`, snap, db())
    } catch {
      // A handle that can't be stored (some browsers) must not cost the text.
      await set(`snap:${snap.id}`, { ...snap, handle: null }, db())
    }
  }

  async function appendHistory(id: string, entry: HistoryEntry): Promise<void> {
    const list = ((await get(`hist:${id}`, db())) as HistoryEntry[] | undefined) ?? []
    list.push(entry)
    await set(`hist:${id}`, list.slice(-HISTORY_SIZE), db())
  }

  async function readHistory(id: string): Promise<HistoryEntry[]> {
    return ((await get(`hist:${id}`, db())) as HistoryEntry[] | undefined) ?? []
  }

  async function deleteDocument(id: string): Promise<void> {
    await Promise.all([del(`snap:${id}`, db()), del(`hist:${id}`, db())])
  }

  /**
   * Backups with unsaved changes whose tab is gone, newest first. Also prunes old clean
   * records so storage stays bounded.
   */
  async function findRecoverable(): Promise<Snapshot[]> {
    const held = await heldLocks()
    const snaps = (await entries(db()))
      .filter(([key]) => String(key).startsWith('snap:'))
      .map(([, value]) => value as Snapshot)
      .filter((s) => !held.has(s.id))
      .sort((a, b) => b.at - a.at)

    const clean = snaps.filter((s) => !s.unsaved)
    await Promise.all(clean.slice(MAX_CLEAN_RECORDS).map((s) => deleteDocument(s.id)))

    return snaps.filter((s) => s.unsaved)
  }

  /** Hold this document's lock until release() or until the tab dies. */
  function holdLock(id: string): () => void {
    if (!('locks' in navigator)) return () => {}
    let release!: () => void
    const done = new Promise<void>((resolve) => (release = resolve))
    navigator.locks.request(LOCK_PREFIX + id, () => done).catch(() => {})
    return release
  }

  async function heldLocks(): Promise<Set<string>> {
    if (!('locks' in navigator)) return new Set()
    const { held = [] } = await navigator.locks.query()
    return new Set(
      held.map((l) => l.name ?? '').filter((n) => n.startsWith(LOCK_PREFIX)).map((n) => n.slice(LOCK_PREFIX.length)),
    )
  }

  return { writeSnapshot, appendHistory, readHistory, deleteDocument, findRecoverable, holdLock }
}

/** Ask the browser not to evict our backups under storage pressure. Best effort. */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) {
      await navigator.storage.persist?.()
    }
  } catch {
    // Not supported or refused: backups still work, they are just evictable.
  }
}
