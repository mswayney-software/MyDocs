/** One address per stored picture, made once and shared by every view of it. */
const urls = new WeakMap<Blob, string>()
export function pictureUrl(blob: Blob | undefined): string | undefined {
  if (!blob) return undefined
  let url = urls.get(blob)
  if (!url) {
    url = URL.createObjectURL(blob)
    urls.set(blob, url)
  }
  return url
}
