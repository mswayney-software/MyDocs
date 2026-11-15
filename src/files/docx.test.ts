import JSZip from 'jszip'
import { exportDocx, halfPoints } from './docx-export'
import { readMargin, readParagraphs, readRuns, readSection, readStyles } from './docx-xml'
import { DEFAULT_PAGE, type PageSettings } from './native'

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'

describe('reading Word page setup', () => {
  it('reads paper size, margins and which header the document uses', () => {
    const xml = `<w:document ${W}><w:body><w:p/><w:sectPr>
      <w:headerReference w:type="first" r:id="rId9"/><w:headerReference w:type="default" r:id="rId8"/>
      <w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1800" w:bottom="1080" w:left="1800" w:header="720"/>
    </w:sectPr></w:body></w:document>`
    expect(readSection(xml)).toEqual({
      paperSize: 'a4',
      margins: { top: 1, right: 1.25, bottom: 0.75, left: 1.25 },
      headerRel: 'rId8',
      footerRel: undefined,
    })
  })

  it('reads an MLA header: last name, then the page number field Word wrote', () => {
    const header = `<w:hdr ${W}><w:p><w:pPr><w:jc w:val="right"/></w:pPr>
      <w:r><w:t xml:space="preserve">Smith </w:t></w:r>
      <w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE \\* MERGEFORMAT </w:instrText></w:r>
      <w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>4</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>
    </w:p></w:hdr>`
    expect(readMargin(header)).toEqual({ text: '', align: 'right', pageNumber: { prefix: 'Smith', align: 'right' } })
  })

  it('reads header text laid out with tabs, and a simple page field', () => {
    const header = `<w:hdr ${W}><w:p>
      <w:r><w:t>Biology 101</w:t></w:r><w:r><w:tab/></w:r><w:r><w:tab/></w:r>
      <w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple>
    </w:p></w:hdr>`
    expect(readMargin(header)).toEqual({ text: 'Biology 101', align: 'left', pageNumber: { prefix: '', align: 'right' } })
  })
})

describe('reading Word paragraph and run formatting', () => {
  const styles = `<w:styles ${W}>
    <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>
      <w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
    <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
    <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/>
      <w:pPr><w:jc w:val="center"/><w:spacing w:before="240"/></w:pPr><w:rPr><w:sz w:val="24"/></w:rPr></w:style>
    <w:style w:type="paragraph" w:styleId="MLA"><w:name w:val="MLA body"/><w:basedOn w:val="Normal"/>
      <w:pPr><w:spacing w:line="480" w:after="0"/><w:ind w:firstLine="720"/></w:pPr></w:style>
  </w:styles>`
  const s = readStyles(styles, null)

  it('takes what each paragraph inherits from its styles and the document defaults', () => {
    const doc = `<w:document ${W}><w:body>
      <w:p><w:r><w:t>Plain</w:t></w:r></w:p>
      <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Heading</w:t></w:r></w:p>
      <w:p><w:pPr><w:pStyle w:val="MLA"/></w:pPr><w:r><w:t>Body</w:t></w:r></w:p>
      <w:p><w:pPr><w:pStyle w:val="MLA"/><w:jc w:val="both"/><w:ind w:left="720" w:hanging="720"/><w:numPr><w:numId w:val="3"/></w:numPr></w:pPr></w:p>
    </w:body></w:document>`
    expect(readParagraphs(doc, s)).toEqual([
      { font: 'Carlito', size: 11, lineHeight: 1.08, spaceAfter: 8 },
      { align: 'center', heading: true, font: 'Carlito', size: 12 },
      { font: 'Carlito', size: 11, lineHeight: 2, firstLine: 0.5 },
      { font: 'Carlito', size: 11, lineHeight: 2, align: 'justify', indent: 0.5, firstLine: -0.5, list: '3' },
    ])
  })

  it('reads fonts, sizes, colors and highlights set on runs, in document order', () => {
    const doc = `<w:document ${W}><w:body><w:p>
      <w:r><w:t>plain</w:t></w:r>
      <w:r><w:rPr><w:rFonts w:ascii="Arial"/><w:sz w:val="28"/><w:color w:val="C00000"/><w:highlight w:val="yellow"/></w:rPr><w:t>loud</w:t></w:r>
      <w:del><w:r><w:t>deleted</w:t></w:r></w:del>
    </w:p></w:body></w:document>`
    expect(readRuns(doc, null)).toEqual([{}, { font: 'Arimo', size: 14, color: '#c00000', highlight: '#ffff00' }])
  })

  it('converts CSS font sizes to Word half-points', () => {
    expect(halfPoints('12pt')).toBe(24)
    expect(halfPoints('16px')).toBe(24)
    expect(halfPoints('nonsense')).toBeUndefined()
  })
})

describe('writing Word files', () => {
  async function parts(page: PageSettings) {
    const blob = await exportDocx(
      {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
          { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] }] },
        ],
      },
      page,
      'Essay',
    )
    const zip = await JSZip.loadAsync(await blob.arrayBuffer())
    const read = (p: string) => zip.file(p)?.async('string') ?? Promise.resolve('')
    return { zip, document: await read('word/document.xml'), core: await read('docProps/core.xml'), read }
  }

  it('writes the page size, margins, and an MLA header with a live page number', async () => {
    const { document, zip, read } = await parts({ ...DEFAULT_PAGE, paperSize: 'a4', pageNumbers: 'header-right', pageNumberPrefix: 'Smith' })
    expect(document).toMatch(/<w:pgSz w:w="11906" w:h="16838"/)
    expect(document).toMatch(/w:top="1440"[^>]*w:header="720"/)
    const header = Object.keys(zip.files).find((f) => /word\/header\d*\.xml/.test(f))!
    const xml = await read(header)
    expect(xml).toContain('Smith ')
    expect(xml).toMatch(/PAGE/)
    expect(readMargin(xml)).toMatchObject({ pageNumber: { prefix: 'Smith', align: 'right' } })
  })

  it('writes no header when there is nothing to print, and no personal details', async () => {
    const { zip, core } = await parts(DEFAULT_PAGE)
    expect(Object.keys(zip.files).some((f) => /word\/header\d*\.xml/.test(f))).toBe(false)
    expect(core).toContain('<dc:creator>Open Writer</dc:creator>')
    expect(core).toContain('<dc:title>Essay</dc:title>')
  })
})
