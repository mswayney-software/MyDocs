// The stress deck from the spec's performance budgets: 60 slides, 30 pictures, 10 tables and
// 10 charts, every slide with a title, text and speaker notes. Every budget is measured on it.
//
// Run: node scripts/stress-deck.ts [output file]   (writes stress-deck.myslides by default)
//
// Plain Node and JSZip, nothing else: the pictures are PNGs drawn pixel by pixel and compressed
// with Node's zlib. Each is 1920 px wide (the most a deck stores), so the browser decodes as
// many pixels as it would for real photos.
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { crc32, deflateSync } from 'node:zlib'
import JSZip from 'jszip'

export const STRESS = { slides: 60, pictures: 30, tables: 10, charts: 10 } as const

// ---- pictures ----------------------------------------------------------------------------

function chunk(type: string, data: Buffer) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0)
  return Buffer.concat([head, data, crc])
}

/** A picture with broad color fields and fine stripes, different for every seed. */
export function picture(seed: number, width = 1920, height = 1080): Buffer {
  const row = width * 3 + 1
  const raw = Buffer.alloc(row * height)
  const hue = (seed * 47) % 360
  for (let y = 0; y < height; y++) {
    raw[y * row] = 0 // no filter
    for (let x = 0; x < width; x++) {
      const i = y * row + 1 + x * 3
      const t = (x / width + y / height) / 2
      // Bands of color rather than per-pixel noise: the file compresses to about photo size.
      const ripple = Math.round(Math.sin((x + seed * 13) / (40 + (seed % 7) * 6)) * Math.cos(y / (50 + (seed % 5) * 8)) * 6) * 5
      raw[i] = clamp(128 + 100 * Math.sin(((hue + t * 140) * Math.PI) / 180) + ripple)
      raw[i + 1] = clamp(128 + 100 * Math.sin(((hue + 120 + t * 90) * Math.PI) / 180) - ripple)
      raw[i + 2] = clamp(128 + 100 * Math.sin(((hue + 240 + t * 60) * Math.PI) / 180) + ripple / 2)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bits per channel
  ihdr[9] = 2 // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v / 6) * 6))
const mediaPath = (bytes: Buffer) => `media/${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}.png`

// ---- slides ------------------------------------------------------------------------------

const text = (...paragraphs: string[]) => ({
  type: 'doc',
  content: paragraphs.map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p }] })),
})
const bullets = (...items: string[]) => ({
  type: 'doc',
  content: [
    {
      type: 'bulletList',
      content: items.map((t) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })),
    },
  ],
})

const TOPICS = ['Cells', 'Energy', 'Ecosystems', 'Water cycle', 'Weather', 'Plate tectonics', 'Light', 'Sound', 'Forces', 'Matter']

/** What each slide holds besides its title: the counts come out exactly as STRESS says. */
function plan(): ('title' | 'section' | 'picture' | 'table' | 'chart' | 'text')[] {
  let tables = 0
  let charts = 0
  let odd = 0
  return Array.from({ length: STRESS.slides }, (_, i) => {
    const n = i + 1
    if (n === 1) return 'title'
    if (n % 10 === 1) return 'section'
    if (n % 2 === 0) return 'picture'
    odd++
    if (odd % 2 === 1 && tables < STRESS.tables) return (tables++, 'table')
    if (odd % 2 === 0 && charts < STRESS.charts) return (charts++, 'chart')
    return 'text'
  })
}

function slide(n: number, kind: ReturnType<typeof plan>[number], pictures: string[]) {
  const id = `s${n}`
  const el = (k: string) => `${id}-${k}`
  const topic = TOPICS[(n - 1) % TOPICS.length]
  const title = (t: string, box = { x: 80, y: 40, w: 1120, h: 110 }) => ({
    id: el('title'), type: 'text', role: 'title', ...box, verticalAlign: 'bottom', content: text(t),
  })
  const notes = `Slide ${n}. Remind the class what ${topic.toLowerCase()} has to do with last week.\nAsk one question before moving on.`
  const base = { id, background: null, transition: n % 3 === 0 ? 'fade' : 'none', notes }

  if (kind === 'title')
    return {
      ...base, layout: 'title', elements: [
        title('Stress deck: a year of science', { x: 120, y: 220, w: 1040, h: 160 }),
        { id: el('sub'), type: 'text', role: 'subtitle', x: 120, y: 400, w: 1040, h: 100, verticalAlign: 'top', content: text('60 slides, 30 pictures, 10 tables, 10 charts') },
      ],
    }
  if (kind === 'section')
    return {
      ...base, layout: 'section', background: 'accent4', elements: [
        title(`Part ${(n - 1) / 10 + 1}: ${topic}`, { x: 80, y: 330, w: 1120, h: 140 }),
        { id: el('sub'), type: 'text', role: 'subtitle', x: 80, y: 490, w: 1120, h: 90, verticalAlign: 'top', content: text('What we will find out') },
      ],
    }

  const elements: unknown[] = [title(`${topic}: slide ${n}`)]
  const body = bullets(`What ${topic.toLowerCase()} means`, 'An example from everyday life', 'How we measure it', 'One question to discuss')
  if (kind === 'picture') {
    // A picture beside the text.
    const src = pictures[(n / 2 - 1) % pictures.length]
    elements.push(
      { id: el('body'), type: 'text', role: 'body', x: 80, y: 180, w: 540, h: 480, verticalAlign: 'top', content: body },
      { id: el('pic'), type: 'image', x: 660, y: 200, w: 540, h: 304, src, alt: `Pattern ${n}` },
    )
  } else if (kind === 'table') {
    elements.push(table(el('table')))
  } else if (kind === 'chart') {
    elements.push(chart(el('chart'), n))
  } else {
    elements.push({ id: el('body'), type: 'text', role: 'body', x: 80, y: 180, w: 1120, h: 480, verticalAlign: 'top', content: body })
  }
  elements.push(
    { id: el('dot'), type: 'shape', shape: 'ellipse', x: 1180, y: 640, w: 48, h: 48, fill: 'accent1', stroke: null, strokeWidth: 2 },
    { id: el('rule'), type: 'shape', shape: 'line', x: 80, y: 160, w: 1120, h: 0, fill: null, stroke: 'accent3', strokeWidth: 3 },
  )
  return { ...base, layout: kind === 'picture' ? 'two-columns' : kind === 'text' ? 'title-content' : 'title-only', elements }
}

function table(id: string) {
  const cols = 4
  const row = (cells: string[]) => ({ cells: cells.map((c) => ({ content: text(c), fill: null, align: 'left' })) })
  return {
    id, type: 'table', x: 80, y: 180, w: 1120, h: 420, headerRow: true,
    columnWidths: Array(cols).fill(280),
    rows: [row(['Sample', 'Before', 'After', 'Change']), ...Array.from({ length: 6 }, (_, r) => row([`Sample ${r + 1}`, `${10 + r}`, `${14 + r * 2}`, `+${4 + r}`]))],
  }
}

function chart(id: string, n: number) {
  const chartType = (['bar', 'line', 'pie'] as const)[Math.floor(n / 6) % 3]
  const categories = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const series = (chartType === 'pie' ? ['Share'] : ['Group A', 'Group B', 'Group C']).map((name, s) => ({
    name,
    values: categories.map((_, c) => ((n + s * 7 + c * 3) % 11) + 2),
  }))
  return {
    id, type: 'chart', x: 140, y: 180, w: 1000, h: 480, chartType, title: `Readings, week ${n}`, alt: `A ${chartType} chart of readings over six days`,
    categories, series, options: { legend: true, xTitle: 'Day', yTitle: 'Reading' },
  }
}

// ---- the deck ----------------------------------------------------------------------------

export async function buildStressDeck(): Promise<Buffer> {
  const zip = new JSZip()
  const pictures: string[] = []
  for (let i = 0; i < STRESS.pictures; i++) {
    const bytes = picture(i, 1920, i % 3 === 0 ? 1440 : 1080)
    const path = mediaPath(bytes)
    pictures.push(path)
    zip.file(path, bytes, { compression: 'STORE' })
  }
  const at = new Date('2026-09-01T08:00:00Z').toISOString()
  const deck = {
    format: 'myslides',
    formatVersion: 1,
    app: { name: 'MySlides', version: 'stress-deck script' },
    meta: { title: 'Stress deck', created: at, modified: at },
    size: { width: 1280, height: 720 },
    theme: {
      id: 'harbor',
      colors: {
        background: '#F3F7F9', text: '#1D2B36', heading: '#0E4D64', accent1: '#137C8B', accent2: '#F28C28',
        accent3: '#5B8E7D', accent4: '#B8D8E0', accent5: '#2A3D66', accent6: '#C05746',
      },
      fonts: { heading: 'Atkinson Hyperlegible', body: 'Atkinson Hyperlegible' },
    },
    slides: plan().map((kind, i) => slide(i + 1, kind, pictures)),
  }
  zip.file('deck.json', JSON.stringify(deck, null, 2))
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

// Run directly: write the file.
if (import.meta.url === `file://${process.argv[1].replaceAll('\\', '/').replace(/^(?=[A-Za-z]:)/, '/')}`) {
  const out = process.argv[2] ?? 'stress-deck.myslides'
  const started = Date.now()
  writeFileSync(out, await buildStressDeck())
  console.log(`wrote ${out} in ${((Date.now() - started) / 1000).toFixed(1)} s`)
}
