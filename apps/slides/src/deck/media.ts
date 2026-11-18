/**
 * Images are stored once per deck, named by a hash of their bytes: a picture used on five
 * slides is one file in media/, and one record in the backup store.
 */

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}
const TYPE_BY_EXT: Record<string, string> = Object.fromEntries(Object.entries(EXT_BY_TYPE).map(([t, e]) => [e, t]))

/** Images held by the open deck, keyed by their path in the file ("media/<hash>.jpg"). */
export type Media = Map<string, Blob>

/** First 16 hex digits of the SHA-256 of the bytes: plenty to tell a deck's images apart. */
export async function hashBytes(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(digest.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('')
}

export const extensionFor = (type: string): string | null => EXT_BY_TYPE[type] ?? null
export const typeForPath = (path: string): string => TYPE_BY_EXT[path.slice(path.lastIndexOf('.') + 1)] ?? 'application/octet-stream'

/** Add an image (already shrunk) to the deck's media. Returns its path, for an image element's src. */
export async function addMedia(media: Media, blob: Blob): Promise<string> {
  const ext = extensionFor(blob.type)
  if (!ext) throw new Error(`unsupported image type ${blob.type}`)
  const path = `media/${await hashBytes(await blob.arrayBuffer())}.${ext}`
  if (!media.has(path)) media.set(path, blob)
  return path
}
