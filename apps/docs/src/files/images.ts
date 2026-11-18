import { blobToDataUrl, shrinkImage } from '@mysuite/core/images'

export { pickImageFile } from '@mysuite/core/images'

/** Images are embedded in the document as data URLs, shrunk to this longest edge. */
export const MAX_IMAGE_EDGE = 1600

export interface EmbeddedImage {
  src: string
  width: number
  height: number
}

/** Turn an image file into a data URL to embed in the document, shrinking large photos first. */
export async function imageFileToDataUrl(file: File): Promise<EmbeddedImage> {
  const { blob, width, height } = await shrinkImage(file, MAX_IMAGE_EDGE)
  return { src: await blobToDataUrl(blob), width, height }
}

/** CSS pixels available across a Letter page with 1 inch margins (6.5 in). */
export const PAGE_CONTENT_WIDTH_PX = 624

/** Fit an inserted image to the page width, keeping its aspect ratio. */
export function fitToPage(img: EmbeddedImage): { width: number; height: number } {
  const scale = Math.min(1, PAGE_CONTENT_WIDTH_PX / img.width)
  return { width: Math.round(img.width * scale), height: Math.round(img.height * scale) }
}
