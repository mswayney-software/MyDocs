import { getSchema } from '@tiptap/core'
import { createExtensions } from '../editor/extensions'
import { DEFAULT_PAGE, parse, readPage, serialize, type PageSettings } from './native'
import { cssString, hasMarginContent, marginBoxes, marginText, pageCss } from './print'

const MLA: PageSettings = { ...DEFAULT_PAGE, pageNumbers: 'header-right', pageNumberPrefix: 'Smith' }

describe('page setup for printing', () => {
  it('puts last name and page number at the top right for MLA', () => {
    expect(marginBoxes(MLA)).toEqual({ 'top-right': '"Smith " counter(page)' })
    expect(marginText(MLA, 3)).toEqual({ 'top-right': 'Smith 3' })
    const css = pageCss(MLA)
    expect(css).toContain('size: letter;')
    expect(css).toContain('margin: 1in 1in 1in 1in;')
    expect(css).toContain('@top-right { content: "Smith " counter(page); }')
  })

  it('prints nothing in the margins by default', () => {
    expect(hasMarginContent(DEFAULT_PAGE)).toBe(false)
    expect(pageCss(DEFAULT_PAGE)).not.toMatch(/@top|@bottom/)
  })

  it('places header, footer and page numbers in their own corners', () => {
    const page: PageSettings = {
      ...DEFAULT_PAGE,
      paperSize: 'a4',
      margins: { top: 1, right: 1.25, bottom: 0.75, left: 1.5 },
      header: 'Biology 101',
      headerAlign: 'center',
      footer: 'Draft',
      footerAlign: 'left',
      pageNumbers: 'footer-right',
    }
    expect(marginBoxes(page)).toEqual({
      'top-center': '"Biology 101"',
      'bottom-left': '"Draft"',
      'bottom-right': 'counter(page)',
    })
    expect(pageCss(page)).toContain('size: A4;')
    expect(pageCss(page)).toContain('margin: 1in 1.25in 0.75in 1.5in;')
  })

  it('joins header text and the page number when they share a corner', () => {
    const page: PageSettings = { ...MLA, header: 'Draft', headerAlign: 'right' }
    expect(marginText(page, 2)).toEqual({ 'top-right': 'Draft Smith 2' })
  })

  it('escapes header text so it can never break out of the CSS', () => {
    expect(cssString('a"b\\c')).toBe('"a\\"b\\\\c"')
    const evil: PageSettings = { ...DEFAULT_PAGE, header: '"; } body { display: none } @top-left { content: "' }
    const css = pageCss(evil)
    // One rule, one box: the quote is escaped, so the text stays inside its string.
    const outsideStrings = css.replace(/"(?:\\.|[^"\\])*"/g, '""')
    expect(outsideStrings.match(/\{/g)).toHaveLength(2)
    expect(outsideStrings).not.toContain('display')
    expect(css).toContain('content: "\\"; } body')
  })
})

describe('page settings in the file', () => {
  const schema = getSchema(createExtensions())
  const file = (page: unknown) =>
    JSON.stringify({ format: 'open-writer', version: 1, page, doc: { type: 'doc', content: [{ type: 'paragraph' }] } })

  it('survive save and reopen exactly', () => {
    const page: PageSettings = { ...MLA, paperSize: 'a4', header: 'Essay', headerAlign: 'center', footer: 'x', footerAlign: 'right' }
    const doc = { type: 'doc', content: [{ type: 'paragraph' }] }
    expect(parse(serialize({ page, doc }), schema).page).toEqual(page)
  })

  it('fills in defaults for files made before page setup existed', () => {
    expect(parse(file({ paperSize: 'letter', margins: { top: 1, right: 1, bottom: 1, left: 1 }, header: '', footer: '', pageNumbers: 'none' }), schema).page).toEqual(DEFAULT_PAGE)
    expect(parse(file(undefined), schema).page).toEqual(DEFAULT_PAGE)
  })

  it('keeps hand-edited values within what can print', () => {
    const page = readPage({
      margins: { top: -5, right: 99, bottom: 'x', left: 0.5 },
      header: 'two\nlines',
      headerAlign: 'sideways',
      pageNumbers: 'everywhere',
    })
    expect(page.margins).toEqual({ top: 0.25, right: 3, bottom: 1, left: 0.5 })
    expect(page.header).toBe('two lines')
    expect(page.headerAlign).toBe('left')
    expect(page.pageNumbers).toBe('none')
  })
})
