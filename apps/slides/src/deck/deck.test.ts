import JSZip from 'jszip'
import { readDeckFile, writeDeckFile } from './container'
import { newDeck } from './defaults'
import { addMedia, type Media } from './media'
import { deckToJson, OpenError, readDeckJson } from './read'
import { FORMAT_VERSION, type Deck, type TextNode } from './schema'

/** A 1x1 PNG. */
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))

const para = (text: string, marks?: TextNode['marks']): TextNode => ({
  type: 'paragraph' as const,
  content: [{ type: 'text' as const, text, ...(marks && { marks }) }],
})

/** A deck using every element type and every rich text feature. */
async function fullDeck(): Promise<{ deck: Deck; media: Media }> {
  const media: Media = new Map()
  const src = await addMedia(media, new Blob([PNG], { type: 'image/png' }))
  const deck = newDeck(new Date('2026-11-18T14:02:00Z'))
  deck.meta.title = 'Cell Division'
  deck.slides.push({
    id: 's2',
    layout: 'title-content',
    background: 'accent5',
    transition: 'fade',
    notes: 'Open with the question\nfrom last class.',
    elements: [
      {
        id: 'e1', type: 'text', role: 'title', x: 80, y: 48, w: 1120, h: 96, verticalAlign: 'middle',
        content: {
          type: 'doc',
          content: [
            para('Growth by week', [{ type: 'bold' }, { type: 'textStyle', attrs: { color: '#C00000', fontFamily: 'Tinos' } }]),
            { type: 'bulletList', content: [{ type: 'listItem', content: [para('one', [{ type: 'link', attrs: { href: 'https://example.com' } }])] }] },
            { type: 'orderedList', content: [{ type: 'listItem', content: [para('two', [{ type: 'highlight' }, { type: 'italic' }])] }] },
          ],
        },
      },
      {
        id: 'e2', type: 'chart', x: 80, y: 176, w: 560, h: 440, chartType: 'bar', title: 'Colony size',
        alt: 'Bar chart of colony size over four weeks', categories: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
        series: [{ name: 'Sample A', values: [12, 30, 74, 160] }, { name: 'Sample B', values: [10, -22, null, 0] }],
        options: { legend: true, xTitle: '', yTitle: 'Cells (thousands)' },
      },
      {
        id: 'e3', type: 'table', x: 680, y: 176, w: 520, h: 200, headerRow: true, columnWidths: [260, 260],
        rows: [
          { cells: [{ content: { type: 'doc', content: [para('Week')] }, fill: null, align: 'left' }, { content: { type: 'doc', content: [para('Cells')] }, fill: 'accent1', align: 'right' }] },
          { cells: [{ content: { type: 'doc', content: [] }, fill: '#F2CC8F', align: 'center' }, { content: { type: 'doc', content: [] }, fill: null, align: 'right' }] },
        ],
      },
      { id: 'e4', type: 'image', x: 680, y: 400, w: 320, h: 216, src, alt: 'Dividing cell under a microscope' },
      { id: 'e5', type: 'shape', shape: 'arrow', x: 1020, y: 500, w: 160, h: 0, fill: null, stroke: 'accent2', strokeWidth: 4 },
      { id: 'e6', type: 'shape', shape: 'round-rect', x: 20, y: 20, w: 100, h: 60, fill: '#1F7A8C', stroke: null, strokeWidth: 0 },
    ],
  })
  return { deck, media }
}

describe('deck file', () => {
  test('a deck with every element type saves, reopens, and compares equal', async () => {
    const { deck, media } = await fullDeck()
    const file = await writeDeckFile(deck, media)
    const opened = await readDeckFile(file)
    expect(opened.warnings).toEqual([])
    expect(opened.deck).toEqual(deck)
    expect([...opened.media.keys()]).toEqual([...media.keys()])
    const [path] = media.keys()
    expect(new Uint8Array(await opened.media.get(path)!.arrayBuffer())).toEqual(PNG)
    expect(opened.media.get(path)!.type).toBe('image/png')
  })

  test('the file is a plain ZIP: indented deck.json, pictures by hash, README', async () => {
    const { deck, media } = await fullDeck()
    const zip = await JSZip.loadAsync(await writeDeckFile(deck, media))
    expect(Object.keys(zip.files).sort()).toEqual(['README.txt', 'deck.json', 'media/', [...media.keys()][0]].sort())
    const json = await zip.file('deck.json')!.async('string')
    expect(json).toMatch(/^\{\n {2}"format": "myslides",\n {2}"formatVersion": 1,/)
    expect(JSON.parse(json).slides[1].elements[1].series[1].values).toEqual([10, -22, null, 0])
    expect([...media.keys()][0]).toMatch(/^media\/[0-9a-f]{16}\.png$/)
    expect(await zip.file('README.txt')!.async('string')).toContain('Rename it to .zip')
  })

  test('the same picture used twice is stored once', async () => {
    const media: Media = new Map()
    const a = await addMedia(media, new Blob([PNG], { type: 'image/png' }))
    const b = await addMedia(media, new Blob([PNG], { type: 'image/png' }))
    expect(a).toBe(b)
    expect(media.size).toBe(1)
  })

  test('fields this version does not know are kept through a round trip', async () => {
    const { deck } = await fullDeck()
    const json = JSON.parse(deckToJson(deck))
    json.futureDeckField = { a: 1 }
    json.slides[1].futureSlideField = 'x'
    json.slides[1].elements[0].shadow = { blur: 4 }
    json.theme.colors.accent7 = '#123456'
    const { deck: read, warnings } = readDeckJson(JSON.stringify(json))
    expect(warnings).toEqual([])
    expect(JSON.parse(deckToJson(read))).toEqual(json)
  })
})

describe('files that cannot be opened', () => {
  const zipWith = async (files: Record<string, string>) => {
    const zip = new JSZip()
    for (const [k, v] of Object.entries(files)) zip.file(k, v)
    return zip.generateAsync({ type: 'blob' })
  }
  const failure = async (file: Blob) => {
    try {
      await readDeckFile(file)
    } catch (err) {
      expect(err).toBeInstanceOf(OpenError)
      return { kind: (err as OpenError).kind, message: (err as OpenError).message }
    }
    throw new Error('opened')
  }

  test('a newer version is refused with a clear message', async () => {
    const json = JSON.parse(deckToJson(newDeck()))
    json.formatVersion = FORMAT_VERSION + 1
    expect(await failure(await zipWith({ 'deck.json': JSON.stringify(json) }))).toEqual({
      kind: 'newer-version',
      message: 'This deck was made with a newer version of MySlides. Update the app to open it.',
    })
  })

  test('a corrupted file, a non-deck ZIP, and garbage JSON each get a clear message', async () => {
    const good = await writeDeckFile(newDeck(), new Map())
    const bytes = new Uint8Array(await good.arrayBuffer())
    expect((await failure(new Blob([bytes.slice(0, bytes.length / 2)]))).kind).toBe('not-ours')
    expect((await failure(new Blob(['hello']))).kind).toBe('not-ours')
    expect((await failure(await zipWith({ 'notes.txt': 'x' }))).message).toBe("This file isn't a MySlides deck.")
    expect((await failure(await zipWith({ 'deck.json': '{ "format": "myslides", "formatVersion": 1, "slides": [' }))).kind).toBe('damaged')
    expect((await failure(await zipWith({ 'deck.json': '{"format":"mydocs","version":1}' }))).kind).toBe('not-ours')
    expect((await failure(await zipWith({ 'deck.json': JSON.stringify({ ...JSON.parse(deckToJson(newDeck())), slides: [] }) }))).kind).toBe('damaged')
  })
})

describe('damaged parts', () => {
  test('a broken element opens as a placeholder and is saved back unchanged', async () => {
    const json = JSON.parse(deckToJson(newDeck()))
    const bad = { id: 'x1', type: 'chart', x: 10, y: 20, w: 300, h: 200, chartType: 'radar', categories: ['a'], series: [] }
    json.slides[0].elements.push(bad)
    const { deck, warnings } = readDeckJson(JSON.stringify(json))
    expect(warnings).toEqual(['One part of this deck could not be read. It shows as a gray box; everything else opened normally.'])
    const el = deck.slides[0].elements[2]
    expect(el).toMatchObject({ type: 'broken', id: 'x1', x: 10, y: 20, w: 300, h: 200, reason: 'A chart could not be read.' })
    expect(JSON.parse(deckToJson(deck)).slides[0].elements[2]).toEqual(bad)
  })

  test('a picture missing from the file becomes a placeholder', async () => {
    const { deck, media } = await fullDeck()
    const zip = await JSZip.loadAsync(await writeDeckFile(deck, media))
    zip.remove([...media.keys()][0])
    const opened = await readDeckFile(await zip.generateAsync({ type: 'blob' }))
    const el = opened.deck.slides[1].elements[3]
    expect(el).toMatchObject({ type: 'broken', reason: 'This picture is missing from the file.' })
    expect(opened.warnings).toHaveLength(1)
  })

  test('limits: too many table rows or chart series are damaged elements, not crashes', () => {
    const json = JSON.parse(deckToJson(newDeck()))
    const cell = { content: { type: 'doc', content: [] }, fill: null, align: 'left' }
    json.slides[0].elements = [
      { id: 't', type: 'table', x: 0, y: 0, w: 10, h: 10, columnWidths: [10], rows: Array.from({ length: 21 }, () => ({ cells: [cell] })) },
      { id: 'c', type: 'chart', x: 0, y: 0, w: 10, h: 10, chartType: 'bar', categories: ['a'], series: Array.from({ length: 7 }, (_, i) => ({ name: `${i}`, values: [1] })) },
      { id: 'r', type: 'table', x: 0, y: 0, w: 10, h: 10, columnWidths: [10, 10], rows: [{ cells: [cell] }] },
    ]
    const { deck } = readDeckJson(JSON.stringify(json))
    expect(deck.slides[0].elements.map((e) => e.type)).toEqual(['broken', 'broken', 'broken'])
  })

  test('rich text outside the allowed nodes and marks is damaged', () => {
    const json = JSON.parse(deckToJson(newDeck()))
    json.slides[0].elements[0].content = { type: 'doc', content: [{ type: 'heading', content: [] }] }
    json.slides[0].elements[1].content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'script' }] }] }] }
    const { deck } = readDeckJson(JSON.stringify(json))
    expect(deck.slides[0].elements.map((e) => e.type)).toEqual(['broken', 'broken'])
  })

  test('bad slide settings reset to defaults; a bad theme falls back to the plain theme', () => {
    const json = JSON.parse(deckToJson(newDeck()))
    json.slides[0].transition = 'spin'
    json.slides[0].background = 'chartreuse'
    json.theme = { id: 'x' }
    const { deck, warnings } = readDeckJson(JSON.stringify(json))
    expect(deck.slides[0]).toMatchObject({ transition: 'none', background: null })
    expect(deck.theme.id).toBe('plain')
    expect(warnings).toEqual([
      'The deck’s theme could not be read, so it uses the plain theme.',
      'Some slide settings could not be read and were reset.',
    ])
  })

  test('duplicate ids are made unique', () => {
    const json = JSON.parse(deckToJson(newDeck()))
    json.slides.push(structuredClone(json.slides[0]))
    const { deck } = readDeckJson(JSON.stringify(json))
    const ids = deck.slides.flatMap((s) => [s.id, ...s.elements.map((e) => e.id)])
    expect(new Set(ids).size).toBe(ids.length)
  })
})
