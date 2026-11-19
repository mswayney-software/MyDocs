import { FIT_STEPS, pageMode, printCss } from './print'

const ua = (userAgent: string, brands?: string[]) => ({ userAgent, userAgentData: brands ? { brands: brands.map((brand) => ({ brand })) } : undefined })

describe('which pages a browser gets', () => {
  it('slide-sized pages in Chromium browsers', () => {
    expect(pageMode(ua('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/142.0 Safari/537.36', ['Chromium', 'Google Chrome']))).toBe('exact')
    expect(pageMode(ua('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/142.0 Safari/537.36 Edg/142.0', ['Chromium', 'Microsoft Edge']))).toBe('exact')
    expect(pageMode(ua('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36'))).toBe('exact')
  })
  it('fitted pages in Firefox, Safari, and every browser on iPhone and iPad', () => {
    expect(pageMode(ua('Mozilla/5.0 (Windows NT 10.0; rv:145.0) Gecko/20100101 Firefox/145.0'))).toBe('fit')
    expect(pageMode(ua('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15'))).toBe('fit')
    expect(pageMode(ua('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 CriOS/142.0 Mobile/15E148 Safari/604.1'))).toBe('fit')
  })
})

describe('print rules', () => {
  it('exact: the page is the slide, 13.333 by 7.5 inches, no margin', () => {
    const css = printCss('exact', 1280, 720)
    expect(css).toContain('@page { size: 13.333333333333334in 7.5in; margin: 0; }')
    expect(css).toContain('.print-page { width: 1280px; height: 720px; }')
  })
  it('fit: a scale for every width from 2 to 14.5 inches, widest last so it wins', () => {
    const css = printCss('fit', 1280, 720)
    expect(FIT_STEPS[0]).toBe(192)
    expect(FIT_STEPS.at(-1)).toBe(1392)
    expect(css).toContain('@container print-page (min-width: 960px) { .print-scale { transform: scale(0.75); } }')
    expect(css.indexOf('min-width: 960px')).toBeLessThan(css.indexOf('min-width: 968px'))
    // Letter landscape at 0.4 in margins leaves 10.2 in = 979 px: the slide is drawn at 976 px.
    const fitting = FIT_STEPS.filter((w) => w <= 979).at(-1)
    expect(fitting).toBe(976)
  })
})
