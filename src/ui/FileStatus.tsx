import type { SessionState } from '../files/session'
import { shortcutLabel } from './shortcuts'

/** File name, then whether it is saved, in plain words. */
export function FileStatus({ state }: { state: SessionState }) {
  const status = state.dirty
    ? 'Unsaved changes'
    : state.hasFile
      ? 'Saved'
      : null
  const hint = state.dirty
    ? `Backed up on this device. Press ${shortcutLabel('Mod+S')} to save to a file.`
    : undefined
  return (
    <div className="file-status">
      <span className="file-name">{state.fileName}</span>
      {/* Announced to screen readers when it changes. */}
      <span className="file-state" role="status" aria-live="polite" title={hint}>
        {state.notice ?? status}
      </span>
    </div>
  )
}
