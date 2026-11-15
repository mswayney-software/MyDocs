/**
 * Turn an image file into a data URL to embed in the document. Large photos are scaled
 * down first: a 12-megapixel phone photo is ~5 MB, and the document is backed up every
 * second, so embedding it as is would make typing stutter on a 4 GB laptop.
 */
export const MAX_IMAGE_EDGE = 1600
const JPEG_QUALITY = 0.85
/** Smaller than this and already a web format: keep the original bytes. */
const KEEP_AS_IS_BYTES = 300 * 1024

export interface EmbeddedImage {
  src: string
  width: number
  height: number
}

export async function imageFileToDataUrl(file: File): Promise<EmbeddedImage> {
  if (!file.type.startsWith('image/')) throw new Error('not an image')
  const bitmap = await createImageBitmap(file)
  try {
    const { width, height } = bitmap
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(width, height))
    const w = Math.round(width * scale)
    const h = Math.round(height * scale)

    const webFormat = /^image\/(png|jpeg|gif|webp)$/.test(file.type)
    if (scale === 1 && webFormat && file.size <= KEEP_AS_IS_BYTES) {
      return { src: await readAsDataUrl(file), width: w, height: h }
    }

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0, w, h)
    // PNG keeps transparency (diagrams, screenshots); photos become JPEG.
    const keepPng = file.type === 'image/png' || file.type === 'image/gif'
    const src = keepPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', JPEG_QUALITY)
    return { src, width: w, height: h }
  } finally {
    bitmap.close()
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** CSS pixels available across a Letter page with 1 inch margins (6.5 in). */
export const PAGE_CONTENT_WIDTH_PX = 624

/** Fit an inserted image to the page width, keeping its aspect ratio. */
export function fitToPage(img: EmbeddedImage): { width: number; height: number } {
  const scale = Math.min(1, PAGE_CONTENT_WIDTH_PX / img.width)
  return { width: Math.round(img.width * scale), height: Math.round(img.height * scale) }
}

/** Show a file picker for one image. Resolves null if cancelled. */
export function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/gif,image/webp,image/bmp'
    input.style.display = 'none'
    document.body.append(input)
    let settled = false
    const finish = (f: File | null) => {
      if (settled) return
      settled = true
      input.remove()
      resolve(f)
    }
    input.addEventListener('change', () => finish(input.files?.[0] ?? null))
    // See fileAccess.ts: a "cancel" can precede the "change" for one pick.
    input.addEventListener('cancel', () => setTimeout(() => finish(input.files?.[0] ?? null), 500))
    if ('showPicker' in HTMLInputElement.prototype) input.showPicker()
    else input.click()
  })
}
