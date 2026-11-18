/** Allowed link targets: web and email addresses. A bare "example.com" counts as web. */
export function isSafeLink(url: string): boolean {
  const u = url.trim()
  if (!u || /\s/.test(u)) return false
  const scheme = u.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase()
  return !scheme || scheme === 'http' || scheme === 'https' || scheme === 'mailto'
}

/** What a student typed, made into a link: "example.com" -> "https://example.com". */
export function normalizeLink(url: string): string | null {
  const u = url.trim()
  if (!isSafeLink(u)) return null
  if (/^(https?:|mailto:)/i.test(u)) return u
  if (/^[^@\s/]+@[^@\s]+\.[^@\s]+$/.test(u)) return `mailto:${u}`
  return `https://${u}`
}
