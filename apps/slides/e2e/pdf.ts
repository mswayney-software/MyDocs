import { inflateSync } from 'node:zlib'

/**
 * Just enough PDF reading for the Save as PDF tests, with Node's own zlib (no PDF library): the
 * pages, their size, what their content draws (text, vector paths, pictures). It reads the
 * uncompressed object layout Chrome's PDF writer uses; it is not a general PDF parser.
 */

interface PdfObject {
  dict: string
  stream: Buffer | null
}

export interface PdfPage {
  /** Width and height in points (1/72 inch). */
  size: [number, number]
  /** Text operators in the page's content (BT ... ET blocks): text a reader can select. */
  textBlocks: number
  /** Path-painting operators (fill, stroke): vector drawing. */
  paths: number
  /** Raster pictures drawn on the page, including inside groups. */
  images: number
  /** Fonts used, and whether each maps its glyphs back to characters (ToUnicode), which copying needs. */
  fonts: { name: string; toUnicode: boolean }[]
}

export function readPdf(bytes: Buffer): PdfPage[] {
  const text = bytes.toString('latin1')
  const objects = new Map<number, PdfObject>()
  const re = /(\d+) 0 obj\s*([\s\S]*?)endobj/g
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const body = m[2]
    const at = body.indexOf('stream')
    let dict = body
    let stream: Buffer | null = null
    if (at >= 0 && /^\s*<</.test(body)) {
      dict = body.slice(0, at)
      const start = m.index + m[0].indexOf(body) + at + 'stream'.length
      const skip = text[start] === '\r' ? 2 : 1
      // The length may be written in another object; the stream ends at "endstream" either way.
      const direct = /\/Length (\d+)(?!\s+0 R)/.exec(dict)?.[1]
      const end = direct ? start + skip + Number(direct) : text.lastIndexOf('endstream', m.index + m[0].length)
      const raw = bytes.subarray(start + skip, end)
      stream = /\/FlateDecode/.test(dict) ? safeInflate(raw) : raw
    }
    objects.set(Number(m[1]), { dict, stream })
  }
  const get = (ref: string | undefined) => (ref ? objects.get(Number(ref)) : undefined)
  const refsIn = (s: string) => [...s.matchAll(/(\d+) 0 R/g)].map((x) => x[1])

  /** A dictionary entry's value: an inline << ... >> or the referenced object's dictionary. */
  const entry = (dict: string, key: string): string => {
    const i = dict.indexOf(`/${key}`)
    if (i < 0) return ''
    const rest = dict.slice(i + key.length + 1).trimStart()
    if (rest.startsWith('<<')) {
      let depth = 0
      for (let j = 0; j < rest.length - 1; j++) {
        if (rest.startsWith('<<', j)) {
          depth++
          j++
        } else if (rest.startsWith('>>', j)) {
          depth--
          j++
          if (!depth) return rest.slice(0, j + 1)
        }
      }
      return rest
    }
    const ref = /^(\d+) 0 R/.exec(rest)?.[1]
    return ref ? (get(ref)?.dict ?? '') : rest.split(/[/>]/)[0]
  }

  const countImages = (resources: string, seen = new Set<string>()): number => {
    let n = 0
    for (const ref of refsIn(entry(resources, 'XObject'))) {
      if (seen.has(ref)) continue
      seen.add(ref)
      const x = get(ref)
      if (!x) continue
      if (/\/Subtype\s*\/Image/.test(x.dict)) n++
      else if (/\/Subtype\s*\/Form/.test(x.dict)) n += countImages(entry(x.dict, 'Resources'), seen)
    }
    return n
  }

  const fontsIn = (resources: string) =>
    refsIn(entry(resources, 'Font')).map((ref) => {
      const f = get(ref)?.dict ?? ''
      return { name: /\/BaseFont\s*\/([^\s/>]+)/.exec(f)?.[1] ?? '?', toUnicode: /\/ToUnicode/.test(f) }
    })

  // Pages in reading order: the page tree from the catalog.
  const order: PdfObject[] = []
  const walk = (ref: string) => {
    const node = get(ref)
    if (!node) return
    if (/\/Type\s*\/Pages\b/.test(node.dict)) refsIn(/\/Kids\s*\[([^\]]*)\]/.exec(node.dict)?.[1] ?? '').forEach(walk)
    else if (/\/Type\s*\/Page\b/.test(node.dict)) order.push(node)
  }
  const catalog = [...objects.values()].find((o) => /\/Type\s*\/Catalog/.test(o.dict))
  const root = catalog && /\/Pages\s+(\d+) 0 R/.exec(catalog.dict)?.[1]
  if (root) walk(root)

  const pages: PdfPage[] = []
  for (const obj of order) {
    const box = /\/MediaBox\s*\[\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*\]/.exec(obj.dict)
    // One content stream (/Contents 6 0 R) or several (/Contents [6 0 R 7 0 R]).
    const contents = refsIn(/\/Contents\s*(\[[^\]]*\]|\d+ 0 R)/.exec(obj.dict)?.[1] ?? '')
    const content = contents.map((r) => get(r)?.stream?.toString('latin1') ?? '').join('\n')
    // Form XObjects (groups) carry drawing too.
    const resources = entry(obj.dict, 'Resources')
    const forms = refsIn(entry(resources, 'XObject')).map(get).filter((x) => x && /\/Subtype\s*\/Form/.test(x.dict))
    const all = content + '\n' + forms.map((f) => f!.stream?.toString('latin1') ?? '').join('\n')
    pages.push({
      size: box ? [Number(box[3]) - Number(box[1]), Number(box[4]) - Number(box[2])] : [0, 0],
      textBlocks: (all.match(/\bBT\b/g) ?? []).length,
      paths: (all.match(/(^|\s)(f\*?|B\*?|b\*?|S|s)(?=\s)/gm) ?? []).length,
      images: countImages(resources),
      fonts: [...fontsIn(resources), ...forms.flatMap((f) => fontsIn(entry(f!.dict, 'Resources')))],
    })
  }
  return pages
}

function safeInflate(raw: Buffer): Buffer {
  try {
    return inflateSync(raw)
  } catch {
    return Buffer.alloc(0)
  }
}
