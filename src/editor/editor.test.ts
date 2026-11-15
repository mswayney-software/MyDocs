import { Editor, type JSONContent } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import { createExtensions } from './extensions'
import { clearFormatting } from './paragraph-format'

const editors: Editor[] = []
function make(content?: JSONContent | string) {
  const e = new Editor({ extensions: createExtensions(), content })
  editors.push(e)
  return e
}
afterEach(() => {
  while (editors.length) editors.pop()!.destroy()
})

/** Select the text of the block containing `text`. */
function selectText(e: Editor, text: string) {
  let found: { from: number; to: number } | null = null
  e.state.doc.descendants((node, pos) => {
    if (found || !node.isText) return
    const i = node.text!.indexOf(text)
    if (i >= 0) found = { from: pos + i, to: pos + i + text.length }
  })
  if (!found) throw new Error(`text not found: ${text}`)
  e.commands.setTextSelection(found)
}

/** A document that uses every M1 feature, built through the same commands the UI calls. */
function buildKitchenSink(): Editor {
  const e = make('<p>My Paper</p><p>Introduction</p><p>Body with bold italic underline strike sup sub red mark big sans.</p><p>Second paragraph.</p><p>Quote here.</p><p>Item one</p><p>Item two</p><p>Step one</p>')
  selectText(e, 'My Paper')
  e.chain().setTitle().setTextAlign('center').run()
  selectText(e, 'Introduction')
  e.commands.setHeading({ level: 1 })
  selectText(e, 'bold'); e.commands.setBold()
  selectText(e, 'italic'); e.commands.setItalic()
  selectText(e, 'underline'); e.commands.setUnderline()
  selectText(e, 'strike'); e.commands.setStrike()
  selectText(e, 'sup'); e.commands.setSuperscript()
  selectText(e, 'sub'); e.commands.setSubscript()
  selectText(e, 'red'); e.commands.setColor('#c00000')
  selectText(e, 'mark'); e.commands.setHighlight({ color: '#00ffff' })
  selectText(e, 'big'); e.commands.setFontSize('18pt')
  selectText(e, 'sans'); e.commands.setFontFamily('Liberation Sans')
  selectText(e, 'Body with')
  e.chain().setTextAlign('justify').setParagraphSpacing(2).setSpaceBefore(12).setSpaceAfter(6).toggleFirstLineIndent().run()
  selectText(e, 'Second paragraph')
  e.chain().toggleHangingIndent().changeIndent(1).run()
  selectText(e, 'Quote here')
  e.commands.toggleBlockquote()
  selectText(e, 'Item one')
  e.commands.toggleBulletList()
  selectText(e, 'Item two')
  e.commands.toggleBulletList()
  e.commands.sinkListItem('listItem')
  selectText(e, 'Step one')
  e.commands.toggleOrderedList()
  return e
}

describe('document model', () => {
  it('builds the kitchen-sink document with every feature present', () => {
    const json = JSON.stringify(buildKitchenSink().getJSON())
    for (const expected of [
      '"type":"title"', '"level":1', '"type":"bold"', '"type":"italic"', '"type":"underline"',
      '"type":"strike"', '"type":"superscript"', '"type":"subscript"', '"color":"#c00000"',
      '"type":"highlight"', '"fontSize":"18pt"', '"fontFamily":"Liberation Sans"',
      '"textAlign":"justify"', '"lineHeight":2', '"spaceBefore":12', '"spaceAfter":6',
      '"firstLine":0.5', '"firstLine":-0.5', '"type":"blockquote"', '"type":"bulletList"',
      '"type":"orderedList"',
    ]) {
      expect(json).toContain(expected)
    }
    // Item two is nested inside Item one's list item.
    expect(json).toMatch(/"Item one".*"type":"bulletList".*"Item two"/)
  })

  it('survives a JSON round trip unchanged', () => {
    const original = buildKitchenSink().getJSON()
    const reloaded = make(structuredClone(original)).getJSON()
    expect(reloaded).toEqual(original)
  })

  it('survives an HTML round trip unchanged (paste and Word import go through HTML)', () => {
    const source = buildKitchenSink()
    const reloaded = make(source.getHTML()).getJSON()
    expect(reloaded).toEqual(source.getJSON())
  })
})

describe('paragraph formatting', () => {
  const attrs = (e: Editor) => e.state.doc.firstChild!.attrs

  it('indents in half-inch steps between 0 and 6 inches', () => {
    const e = make('<p>Text</p>')
    e.commands.changeIndent(1)
    e.commands.changeIndent(1)
    expect(attrs(e).indent).toBe(1)
    for (let i = 0; i < 20; i++) e.commands.changeIndent(1)
    expect(attrs(e).indent).toBe(6)
    for (let i = 0; i < 20; i++) e.commands.changeIndent(-1)
    expect(attrs(e).indent).toBeNull()
  })

  it('toggles hanging indent and gives the indent back when turned off', () => {
    const e = make('<p>Works cited entry</p>')
    e.commands.toggleHangingIndent()
    expect(attrs(e)).toMatchObject({ firstLine: -0.5, indent: 0.5 })
    e.commands.toggleHangingIndent()
    expect(attrs(e)).toMatchObject({ firstLine: null, indent: null })
  })

  it('switches from hanging to first-line indent cleanly', () => {
    const e = make('<p>Text</p>')
    e.commands.toggleHangingIndent()
    e.commands.toggleFirstLineIndent()
    expect(attrs(e)).toMatchObject({ firstLine: 0.5, indent: null })
  })

  it('normalizes colors and fonts read from pasted HTML', () => {
    const e = make('<p><span style="color: rgb(192, 0, 0); font-family: &quot;Liberation Sans&quot;">a</span><mark style="background-color: rgb(255, 255, 0)">b</mark></p>')
    const [a, b] = e.getJSON().content![0].content!
    expect(a.marks![0].attrs).toEqual({ color: '#c00000', fontFamily: 'Liberation Sans', fontSize: null })
    expect(b.marks![0].attrs).toEqual({ color: '#ffff00' })
  })

  it('turning an indented paragraph into a list item drops the paragraph indent', () => {
    const e = make('<p>Point</p>')
    e.chain().toggleFirstLineIndent().changeIndent(1).run()
    e.view.dispatch(closeHistory(e.state.tr)) // start a new undo step, as a pause in typing would
    e.commands.toggleBulletList()
    const item = (e.getJSON() as JSONContent).content![0].content![0].content![0]
    expect(item.type).toBe('paragraph')
    expect(item.attrs).toMatchObject({ indent: null, firstLine: null })
    // One undo step restores the plain indented paragraph.
    e.commands.undo()
    expect(e.getJSON().content![0]).toMatchObject({ type: 'paragraph', attrs: { firstLine: 0.5, indent: 0.5 } })
  })

  it('Enter in a normal paragraph keeps its formatting, as in Word', () => {
    const e = make('<p style="text-align: center">Centered</p>')
    e.commands.focus('end')
    e.commands.keyboardShortcut('Enter')
    expect(e.getJSON().content![1].attrs).toMatchObject({ textAlign: 'center' })
  })

  it('clear formatting returns text and paragraph to Normal', () => {
    const e = make('<h2 style="text-align: center; line-height: 2"><strong>Heading</strong></h2>')
    e.commands.selectAll()
    clearFormatting(e)
    // Tiptap keeps an empty paragraph after a trailing heading; only the first block matters here.
    expect(e.getJSON().content![0]).toEqual({
      type: 'paragraph',
      attrs: { textAlign: null, lineHeight: null, spaceBefore: null, spaceAfter: null, indent: null, firstLine: null },
      content: [{ type: 'text', text: 'Heading' }],
    })
  })
})
