import JSZip from 'jszip'
import { DAMAGED, deckToJson, OpenError, readDeckJson, type ReadResult } from './read'
import { MEDIA_PATH, type Deck } from './schema'
import { typeForPath, type Media } from './media'

/**
 * The deck file: a standard ZIP holding deck.json, the images in media/, and a README.
 * Rename it to .zip and any unzip tool opens it. The extension is a placeholder (spec decision 8).
 */
export const FILE_EXTENSION = '.myslides'
export const FILE_MIME = 'application/vnd.myslides+zip'
export const FILE_DESCRIPTION = 'MySlides deck'

const README = `This is a MySlides presentation (a .myslides file).

It is a standard ZIP archive. Rename it to .zip to look inside:
  deck.json  every slide, word and number, as readable JSON
  media/     the pictures, as ordinary image files
The format is documented in apps/slides/docs/FILE_FORMAT.md in the MySlides source
repository: https://github.com/mswayney-software/MyDocs
`

/** Every picture path the deck points at. */
export function mediaPaths(deck: Deck): Set<string> {
  const paths = new Set<string>()
  for (const slide of deck.slides) for (const el of slide.elements) if (el.type === 'image') paths.add(el.src)
  return paths
}

export async function writeDeckFile(deck: Deck, media: Media): Promise<Blob> {
  const zip = new JSZip()
  zip.file('deck.json', deckToJson(deck, true))
  for (const path of [...mediaPaths(deck)].sort()) {
    const blob = media.get(path)
    // Pictures are already compressed: store them as they are.
    if (blob) zip.file(path, blob, { compression: 'STORE' })
  }
  zip.file('README.txt', README)
  return zip.generateAsync({ type: 'blob', mimeType: FILE_MIME, compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

export interface OpenedDeck extends ReadResult {
  media: Media
}

/** Read a deck file. Throws OpenError with a message for the student; never returns half a deck. */
export async function readDeckFile(file: Blob): Promise<OpenedDeck> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(file)
  } catch {
    throw new OpenError('not-ours', "This file isn't a MySlides deck, or it is damaged.")
  }
  const entry = zip.file('deck.json')
  if (!entry) throw new OpenError('not-ours', "This file isn't a MySlides deck.")

  let text: string
  try {
    text = await entry.async('string')
  } catch {
    throw new OpenError('damaged', DAMAGED)
  }

  const media: Media = new Map()
  const reads: Promise<void>[] = []
  zip.forEach((path, f) => {
    if (f.dir || !MEDIA_PATH.test(path)) return
    reads.push(
      f.async('blob').then(
        (b) => void media.set(path, new Blob([b], { type: typeForPath(path) })),
        () => {}, // an unreadable picture just goes missing; its element becomes a placeholder
      ),
    )
  })
  await Promise.all(reads)

  const result = readDeckJson(text, (src) => media.has(src))
  // Keep only pictures the deck uses.
  const used = mediaPaths(result.deck)
  for (const path of media.keys()) if (!used.has(path)) media.delete(path)
  return { ...result, media }
}
