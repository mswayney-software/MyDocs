/** Zoom for the on-screen page, remembered per browser. Printing and export are never zoomed. */
export const ZOOM_MIN = 50
export const ZOOM_MAX = 200
export const ZOOM_STEP = 10
const KEY = 'mydocs:zoom'

export function loadZoom(): number {
  try {
    const n = Number(localStorage.getItem(KEY))
    return n >= ZOOM_MIN && n <= ZOOM_MAX ? n : 100
  } catch {
    return 100
  }
}

export function saveZoom(z: number) {
  try {
    localStorage.setItem(KEY, String(z))
  } catch {
    // storage blocked: zoom resets next time, which is harmless
  }
}

export const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z / ZOOM_STEP) * ZOOM_STEP))
