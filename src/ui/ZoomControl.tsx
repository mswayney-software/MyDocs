import { Minus, Plus } from 'lucide-react'
import { clampZoom, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from './zoom'

/** Status bar zoom: smaller, the current size (click for 100%), larger. */
export function ZoomControl({ zoom, onZoom }: { zoom: number; onZoom: (z: number) => void }) {
  const keep = (e: React.MouseEvent) => e.preventDefault() // keep the cursor in the document
  return (
    <span className="zoom" role="group" aria-label="Zoom">
      <button type="button" className="zoom-btn" aria-label="Zoom out" title="Zoom out" disabled={zoom <= ZOOM_MIN} onMouseDown={keep} onClick={() => onZoom(clampZoom(zoom - ZOOM_STEP))}>
        <Minus size={13} aria-hidden="true" />
      </button>
      <button type="button" className="zoom-value" aria-label={`Zoom ${zoom}%. Reset to 100%`} title="Reset to 100%" onMouseDown={keep} onClick={() => onZoom(100)}>
        {zoom}%
      </button>
      <button type="button" className="zoom-btn" aria-label="Zoom in" title="Zoom in" disabled={zoom >= ZOOM_MAX} onMouseDown={keep} onClick={() => onZoom(clampZoom(zoom + ZOOM_STEP))}>
        <Plus size={13} aria-hidden="true" />
      </button>
    </span>
  )
}
