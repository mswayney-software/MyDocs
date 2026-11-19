/** Notes text sizes, in pixels. The choice is kept on this device. */
export const NOTE_SIZES = [16, 18, 20, 24, 28, 32, 40]
export const NOTE_SIZE_KEY = 'myslides:presenter-notes-size'
const DEFAULT_NOTE_SIZE = 20

export function loadNoteSize() {
  try {
    const n = Number(localStorage.getItem(NOTE_SIZE_KEY))
    return NOTE_SIZES.includes(n) ? n : DEFAULT_NOTE_SIZE
  } catch {
    return DEFAULT_NOTE_SIZE
  }
}

/** "4:07" or "1:02:09". */
export function formatElapsed(ms: number) {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}
