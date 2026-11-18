import { pickFileWithInput } from './file-access'

/**
 * Shrink an image file before it goes into a document or deck. A 12-megapixel phone photo
 * is ~5 MB, and files are backed up every second or two, so storing it as is would make
 * editing stutter on a 4 GB laptop. Each app picks its own longest edge.
 */
const JPEG_QUALITY = 0.85
/** Smaller than this and already a web format: keep the original bytes. */
const KEEP_AS_IS_BYTES = 300 * 1024

export interface ShrunkImage {
  blob: Blob
  width: number
  height: number
}

/**
 * `stillGif`: a GIF always becomes a PNG of its first frame, never kept as is (MySlides: an
 * animated GIF would play on the slide, and decks hold still pictures only).
 */
export async function shrinkImage(file: File, maxEdge: number, { stillGif = false } = {}): Promise<ShrunkImage> {
  if (!file.type.startsWith('image/')) throw new Error('not an image')
  const bitmap = await createImageBitmap(file)
  try {
    const { width, height } = bitmap
    const scale = Math.min(1, maxEdge / Math.max(width, height))
    const w = Math.round(width * scale)
    const h = Math.round(height * scale)

    const webFormat = /^image\/(png|jpeg|gif|webp)$/.test(file.type)
    if (scale === 1 && webFormat && file.size <= KEEP_AS_IS_BYTES && !(stillGif && file.type === 'image/gif')) {
      return { blob: file, width: w, height: h }
    }

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0, w, h)
    // PNG keeps transparency (diagrams, screenshots); photos become JPEG.
    const keepPng = file.type === 'image/png' || file.type === 'image/gif'
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('image could not be encoded'))),
        keepPng ? 'image/png' : 'image/jpeg',
        keepPng ? undefined : JPEG_QUALITY,
      ),
    )
    return { blob, width: w, height: h }
  } finally {
    bitmap.close()
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** Show a file picker for one image. Resolves null if cancelled. */
export const pickImageFile = () => pickFileWithInput('image/png,image/jpeg,image/gif,image/webp,image/bmp')
