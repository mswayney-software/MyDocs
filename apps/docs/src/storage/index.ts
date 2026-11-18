import { createBackups } from '@mysuite/core/backups'

export { HISTORY_INTERVAL_MS, HISTORY_SIZE, requestPersistentStorage, type Snapshot } from '@mysuite/core/backups'

/** MyDocs' backups. These names are fixed: existing students' backups live under them. */
export const { appendHistory, deleteDocument, findRecoverable, holdLock, readHistory, writeSnapshot } = createBackups({
  database: 'mydocs',
  lockPrefix: 'mydocs-doc:',
})
