import type { DocumentSession } from '../files/session'
import { MAX_MARGIN, MIN_MARGIN, oneLine, type Align, type PageNumberPosition, type PaperSize } from '../files/native'
import { hasMarginContent, PAPER, supportsMarginBoxes } from '../files/print'
import type { Ask } from './dialogTypes'

const ALIGN_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
]

const NUMBER_OPTIONS: { value: PageNumberPosition; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'header-right', label: 'Top right' },
  { value: 'footer-center', label: 'Bottom center' },
  { value: 'footer-right', label: 'Bottom right' },
]

const asAlign = (v: string | undefined, d: Align): Align => (v === 'left' || v === 'center' || v === 'right' ? v : d)

/** A margin typed by the student, in inches, kept within what still leaves room to write. */
function readMargin(v: string | undefined, fallback: number) {
  const n = Number(v)
  if (!Number.isFinite(n) || v === undefined || v.trim() === '') return fallback
  return Math.round(Math.min(MAX_MARGIN, Math.max(MIN_MARGIN, n)) * 100) / 100
}

/** Page > Page setup: paper size and margins. */
export async function pageSetup(session: DocumentSession, ask: Ask) {
  const page = session.getState().page
  const m = page.margins
  const margin = (key: string, label: string, value: number) => ({
    key,
    label,
    value: String(value),
    type: 'number' as const,
    suffix: 'in',
    min: MIN_MARGIN,
    max: MAX_MARGIN,
    step: 0.05,
    half: true,
  })
  const a = await ask({
    title: 'Page setup',
    fields: [
      {
        key: 'paper',
        label: 'Paper size',
        value: page.paperSize,
        type: 'select',
        options: (Object.keys(PAPER) as PaperSize[]).map((p) => ({ value: p, label: PAPER[p].label })),
      },
      margin('top', 'Top margin', m.top),
      margin('bottom', 'Bottom margin', m.bottom),
      margin('left', 'Left margin', m.left),
      margin('right', 'Right margin', m.right),
    ],
    buttons: [
      { label: 'Cancel', value: 'cancel' },
      { label: 'Apply', value: 'apply', primary: true },
    ],
    cancelValue: 'cancel',
  })
  if (a.value !== 'apply') return
  const v = a.values
  session.setPage({
    ...page,
    paperSize: v.paper === 'a4' ? 'a4' : 'letter',
    margins: {
      top: readMargin(v.top, m.top),
      bottom: readMargin(v.bottom, m.bottom),
      left: readMargin(v.left, m.left),
      right: readMargin(v.right, m.right),
    },
  })
}

/** Page > Header, footer and page numbers. */
export async function headerFooter(session: DocumentSession, ask: Ask) {
  const page = session.getState().page
  const a = await ask({
    title: 'Header, footer and page numbers',
    body: 'Printed on every page, and when you save as PDF.',
    fields: [
      { key: 'header', label: 'Header text', value: page.header, maxLength: 200, half: true },
      { key: 'headerAlign', label: 'Header position', value: page.headerAlign, type: 'select', options: ALIGN_OPTIONS, half: true },
      { key: 'footer', label: 'Footer text', value: page.footer, maxLength: 200, half: true },
      { key: 'footerAlign', label: 'Footer position', value: page.footerAlign, type: 'select', options: ALIGN_OPTIONS, half: true },
      { key: 'numbers', label: 'Page numbers', value: page.pageNumbers, type: 'select', options: NUMBER_OPTIONS, half: true },
      {
        key: 'prefix',
        label: 'Text before the number',
        value: page.pageNumberPrefix,
        placeholder: 'Your last name, for MLA',
        maxLength: 100,
        half: true,
      },
    ],
    buttons: [
      { label: 'Cancel', value: 'cancel' },
      { label: 'Apply', value: 'apply', primary: true },
    ],
    cancelValue: 'cancel',
  })
  if (a.value !== 'apply') return
  const v = a.values
  session.setPage({
    ...page,
    header: oneLine(v.header ?? ''),
    headerAlign: asAlign(v.headerAlign, 'left'),
    footer: oneLine(v.footer ?? ''),
    footerAlign: asAlign(v.footerAlign, 'center'),
    pageNumbers: NUMBER_OPTIONS.find((o) => o.value === v.numbers)?.value ?? 'none',
    pageNumberPrefix: oneLine(v.prefix ?? ''),
  })
}

const TIP_KEY = 'open-writer:print-tip-hidden'
const tipHidden = () => {
  try {
    return localStorage.getItem(TIP_KEY) === '1'
  } catch {
    return false
  }
}
const hideTip = () => {
  try {
    localStorage.setItem(TIP_KEY, '1')
  } catch {
    // storage blocked: the tip shows again next time, which is harmless
  }
}

/**
 * File > Print and File > Save as PDF. Both open the browser's print window, which has a
 * "Save as PDF" destination; a short tip says so, and warns where the browser can't print
 * this document's header, footer, or page numbers.
 */
export async function printDocument(session: DocumentSession, ask: Ask, opts: { pdf: boolean }) {
  const page = session.getState().page
  if (hasMarginContent(page) && !supportsMarginBoxes()) {
    const a = await ask({
      title: 'Headers and page numbers won’t print here',
      body:
        'This browser prints the page size and margins, but not the header, footer, or page numbers. ' +
        'To include them, open this document in Chrome or Edge and print from there.',
      buttons: [
        { label: 'Cancel', value: 'cancel' },
        { label: opts.pdf ? 'Continue without them' : 'Print without them', value: 'print', primary: true },
      ],
      cancelValue: 'cancel',
    })
    if (a.value !== 'print') return
  } else if (opts.pdf || !tipHidden()) {
    const steps = opts.pdf
      ? 'In the print window, set Destination to "Save as PDF", then choose Save.'
      : 'Pick your printer in the print window.'
    const a = await ask({
      title: opts.pdf ? 'Save as PDF' : 'Print',
      body:
        steps +
        (hasMarginContent(page)
          ? ' If you see a date or web address at the edges of the page, open More settings and turn off "Headers and footers". Your own header and page numbers stay.'
          : ''),
      fields: opts.pdf ? undefined : [{ key: 'hide', label: 'Don’t show this again', value: 'false', type: 'checkbox' }],
      buttons: [
        { label: 'Cancel', value: 'cancel' },
        { label: 'Continue', value: 'print', primary: true },
      ],
      cancelValue: 'cancel',
    })
    if (a.value !== 'print') return
    if (a.values.hide === 'true') hideTip()
  }
  // Let the dialog close before the print window takes over the page.
  await new Promise((r) => requestAnimationFrame(() => r(null)))
  window.print()
}
