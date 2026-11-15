import { CircleCheck, Download, RefreshCw } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { offline } from '../offline'

/** Install button for the top bar, shown only when the browser offers installation. */
export function InstallButton() {
  const s = useSyncExternalStore(offline.subscribe, offline.getState)
  if (!s.canInstall) return null
  return (
    <button
      type="button"
      className="tb-btn topbar-action"
      title="Install Open Writer as an app on this computer. It opens in its own window and works offline."
      onClick={() => void offline.install()}
    >
      <Download size={16} aria-hidden="true" /> Install app
    </button>
  )
}

/** Right side of the status bar: offline readiness and updates. */
export function OfflineStatus() {
  const s = useSyncExternalStore(offline.subscribe, offline.getState)
  return (
    <span className="status-right">
      {s.updateReady && (
        <button type="button" className="status-btn" onClick={() => offline.restartToUpdate()}>
          <RefreshCw size={12} aria-hidden="true" /> Update ready: restart
        </button>
      )}
      {s.offlineReady && (
        <span className="status-offline" title="Everything is stored on this device. No internet needed.">
          <CircleCheck size={12} aria-hidden="true" /> Works offline
        </span>
      )}
    </span>
  )
}
