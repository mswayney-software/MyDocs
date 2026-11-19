/**
 * Save as PDF (spec, Architecture: PDF). The browser's print window does the work, the same idea
 * as MyDocs: every slide is drawn in static mode, one per page, and the student picks "Save as
 * PDF" as the destination. Text stays text and charts stay vector.
 *
 * Two kinds of page:
 *  - exact: the page is the slide, 13.333 × 7.5 in with no margin. Chrome and Edge honor that
 *    reliably (Phase 0 print test), and 13.333 in is exactly 1280 CSS pixels, the slide's width.
 *  - fit: everywhere else. Firefox and Safari may ignore the page size (Safari printed Letter
 *    portrait and cut the slide off in the Phase 0 test), so nothing may assume a paper size.
 *    Each slide scales to the width the page actually has, in steps (container queries), and a
 *    plain-words note asks for Landscape before printing.
 */

export type PageMode = 'exact' | 'fit'

/** Slide-sized pages are reliable in Chromium browsers (Chrome, Edge, and the like). */
export function pageMode(nav: { userAgent: string; userAgentData?: { brands?: { brand: string }[] } } = navigator): PageMode {
  if (nav.userAgentData?.brands?.some((b) => b.brand === 'Chromium')) return 'exact'
  // Older Chromium without userAgentData; iOS browsers (CriOS, EdgiOS) are WebKit underneath.
  return /\bChrome\/\d/.test(nav.userAgent) && !/Firefox|CriOS|EdgiOS|FxiOS/.test(nav.userAgent) ? 'exact' : 'fit'
}

/** Widths a fit page is scaled for, in CSS pixels: every 8 px from 2 to about 14.5 inches. */
export const FIT_STEPS = Array.from({ length: 1 + (1392 - 192) / 8 }, (_, i) => 192 + i * 8)

/**
 * The print rules for one mode. In fit mode each step says: on a page at least this wide, draw
 * the slide at this scale. The widest step that fits wins, so the slide is never cut off and
 * loses at most 8 px of width.
 */
export function printCss(mode: PageMode, slideWidth: number, slideHeight: number): string {
  if (mode === 'exact') {
    return [
      `@page { size: ${slideWidth / 96}in ${slideHeight / 96}in; margin: 0; }`,
      `.print-page { width: ${slideWidth}px; height: ${slideHeight}px; }`,
    ].join('\n')
  }
  const steps = FIT_STEPS.map(
    (w) => `@container print-page (min-width: ${w}px) { .print-scale { transform: scale(${+(w / slideWidth).toFixed(5)}); } }`,
  )
  return [
    // Asked for; honored by some browsers, not all. The scaling below doesn't depend on it.
    '@page { size: letter landscape; margin: 0.4in; }',
    `.print-page { width: 100%; aspect-ratio: ${slideWidth} / ${slideHeight}; container: print-page / inline-size; }`,
    `.print-scale { transform: scale(${+(FIT_STEPS[0] / slideWidth).toFixed(5)}); }`,
    ...steps,
  ].join('\n')
}

let styleEl: HTMLStyleElement | null = null

/** Put the print rules in the page (kept, so the browser's own Print menu prints the deck right too). */
export function applyPrintCss(css: string) {
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = 'print-pages'
    document.head.append(styleEl)
  }
  if (styleEl.textContent !== css) styleEl.textContent = css
}

/** Wait until every picture in `root` is decoded and every font has loaded: a page printed before that would show gaps. */
export async function settled(root: ParentNode) {
  const pictures = [...root.querySelectorAll('img')].map((img) => (img.complete && img.naturalWidth ? null : img.decode().catch(() => {})))
  await Promise.all([...pictures, document.fonts?.ready])
}
