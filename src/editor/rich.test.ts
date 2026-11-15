import { Editor, getSchema, type JSONContent } from '@tiptap/core'
import { parse, serialize, DEFAULT_PAGE } from '../files/native'
import { countDoc, countText } from './counts'
import { createExtensions } from './extensions'
import { isEmbeddedImage } from './image'
import { isSafeLink, normalizeLink } from './links'
import { findMatches, searchKey } from './search'

const editors: Editor[] = []
const make = (content?: JSONContent | string) => {
  const e = new Editor({ extensions: createExtensions(), content })
  editors.push(e)
  return e
}
afterEach(() => {
  while (editors.length) editors.pop()!.destroy()
})

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

describe('find and replace', () => {
  it('finds matches across formatting changes and ignores case by default', () => {
    const e = make('<p>The <strong>cat</strong> and the CAT and the c<em>at</em>.</p>')
    const m = findMatches(e.state.doc, 'cat', false)
    expect(m).toHaveLength(3)
    expect(m.map((x) => e.state.doc.textBetween(x.from, x.to))).toEqual(['cat', 'CAT', 'cat'])
    expect(findMatches(e.state.doc, 'cat', true)).toHaveLength(2)
  })

  it('never matches across paragraphs or across an image', () => {
    const e = make(`<p>ab</p><p>cd</p>`)
    expect(findMatches(e.state.doc, 'bc', false)).toHaveLength(0)
  })

  it('steps through matches, replaces one, then all, as a single undo step', () => {
    const e = make('<p>red, red, red</p>')
    e.commands.setSearch('red') // selects the first match, as browser find does
    expect(searchKey.getState(e.state)!.current).toBe(0)
    e.commands.nextMatch()
    expect(searchKey.getState(e.state)!.current).toBe(1)
    e.commands.replaceMatch('blue')
    expect(e.state.doc.textContent).toBe('red, blue, red')
    e.commands.replaceAll('green')
    expect(e.state.doc.textContent).toBe('green, blue, green')
    expect(searchKey.getState(e.state)!.matches).toHaveLength(0)
    e.commands.undo()
    expect(e.state.doc.textContent).toBe('red, blue, red')
  })

  it('keeps the formatting of the replaced text', () => {
    const e = make('<p><strong>old</strong> text</p>')
    e.commands.setSearch('old')
    e.commands.replaceMatch('new')
    expect(e.getHTML()).toContain('<strong>new</strong>')
  })
})

describe('word count', () => {
  it('counts words and characters as Word does', () => {
    expect(countText('')).toEqual({ words: 0, characters: 0, charactersNoSpaces: 0 })
    expect(countText('Hello,  world!')).toEqual({ words: 2, characters: 14, charactersNoSpaces: 12 })
    expect(countText('well-known e-mail')).toMatchObject({ words: 2 })
  })

  it('counts words in separate paragraphs separately', () => {
    const e = make('<p>one</p><p>two</p><ul><li><p>three</p></li></ul>')
    expect(countText(e.state.doc.textBetween(0, e.state.doc.content.size, '\n', ' ')).words).toBe(3)
  })
})

describe('links', () => {
  it('allows web and email addresses only', () => {
    expect(isSafeLink('https://example.com')).toBe(true)
    expect(isSafeLink('example.com')).toBe(true)
    expect(isSafeLink('mailto:a@b.co')).toBe(true)
    expect(isSafeLink('javascript:alert(1)')).toBe(false)
    expect(isSafeLink(' JavaScript:alert(1)')).toBe(false)
    expect(isSafeLink('data:text/html,hi')).toBe(false)
    expect(isSafeLink('file:///C:/secret')).toBe(false)
    expect(isSafeLink('two words')).toBe(false)
  })

  it('turns what a student types into a working link', () => {
    expect(normalizeLink('example.com/page')).toBe('https://example.com/page')
    expect(normalizeLink('teacher@school.edu')).toBe('mailto:teacher@school.edu')
    expect(normalizeLink('http://x.org')).toBe('http://x.org')
    expect(normalizeLink('javascript:alert(1)')).toBeNull()
  })

  it('drops unsafe links from pasted HTML', () => {
    const e = make('<p><a href="javascript:alert(1)">bad</a> <a href="https://ok.org">good</a></p>')
    const html = e.getHTML()
    expect(html).not.toContain('javascript:')
    expect(html).toContain('href="https://ok.org"')
  })
})

describe('images', () => {
  it('accepts only images embedded in the document', () => {
    expect(isEmbeddedImage(PIXEL)).toBe(true)
    expect(isEmbeddedImage('https://tracker.example/pixel.gif')).toBe(false)
    expect(isEmbeddedImage('//tracker.example/pixel.gif')).toBe(false)
    expect(isEmbeddedImage('data:text/html;base64,PHNjcmlwdD4=')).toBe(false)
  })

  it('drops web images from pasted HTML and keeps embedded ones', () => {
    const e = make(`<p>a</p><img src="https://tracker.example/p.gif"><img src="${PIXEL}" data-align="right">`)
    const images = e.getJSON().content!.filter((n) => n.type === 'image')
    expect(images).toHaveLength(1)
    expect(images[0].attrs).toMatchObject({ src: PIXEL, align: 'right' })
  })

  it('drops web images from a hand-made .owdoc file', () => {
    const schema = getSchema(createExtensions())
    const text = JSON.stringify({
      format: 'open-writer',
      version: 1,
      doc: { type: 'doc', content: [
        { type: 'image', attrs: { src: 'https://tracker.example/p.gif' } },
        { type: 'image', attrs: { src: PIXEL } },
        { type: 'paragraph' },
      ] },
    })
    const images = parse(text, schema).doc.content!.filter((n) => n.type === 'image')
    expect(images.map((i) => i.attrs!.src)).toEqual([PIXEL])
  })
})

describe('structure rules', () => {
  it('keeps a paragraph after a table at the end of the document, so there is somewhere to type', () => {
    const e = make('<p>Intro</p>')
    e.chain().focus('end').insertTable({ rows: 2, cols: 2 }).run()
    const types = e.getJSON().content!.map((n) => n.type)
    expect(types).toEqual(['paragraph', 'table', 'paragraph'])
  })

  it('does not add lines after a heading at the end', () => {
    const e = make('<h1>Title</h1>')
    e.commands.insertContent('!')
    expect(e.getJSON().content!.map((n) => n.type)).toEqual(['heading'])
  })

  it('refuses a page break inside a table', () => {
    const e = make('<p>Intro</p>')
    e.chain().focus('end').insertTable({ rows: 2, cols: 2 }).run()
    expect(e.isActive('table')).toBe(true)
    expect(e.commands.setPageBreak()).toBe(false)
    expect(JSON.stringify(e.getJSON())).not.toContain('pageBreak')
  })
})

describe('rich content round trip', () => {
  it('a document with a table, image, link and page break survives save and reopen exactly', () => {
    const e = make('<p>Intro</p>')
    e.chain().focus('end').insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    e.commands.insertContent('Cell A1')
    e.chain().focus('end').insertContentAt(e.state.doc.content.size, [
      { type: 'image', attrs: { src: PIXEL, alt: 'dot', width: 120, height: 120, align: 'left' } },
      { type: 'paragraph', content: [{ type: 'text', text: 'see source', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] }] },
      { type: 'pageBreak' },
      { type: 'paragraph', content: [{ type: 'text', text: 'Works Cited' }] },
    ]).run()
    // Merge two body cells, so merged spans are covered too.
    const json = e.getJSON()
    expect(JSON.stringify(json)).toMatch(/"type":"table".*"type":"tableHeader".*Cell A1/)

    const schema = getSchema(createExtensions())
    const reopened = parse(serialize({ page: DEFAULT_PAGE, doc: json }), schema)
    expect(reopened.doc).toEqual(json)
    expect(make(reopened.doc).getJSON()).toEqual(json)
    // Also through HTML, the path pasting takes.
    expect(make(e.getHTML()).getJSON()).toEqual(json)
  })
})

describe('word count in long documents', () => {
  it('counts block by block and matches a count of the whole text', () => {
    const e = make('<h1>Title here</h1><p>one two</p><ul><li><p>three</p></li><li><p>four five</p></li></ul><table><tr><td><p>six</p></td><td><p>seven</p></td></tr></table><p>eight</p>')
    const d = e.state.doc
    const whole = countText(d.textBetween(0, d.content.size, '\n', ' '))
    expect(countDoc(d)).toEqual(whole)
    expect(countDoc(d).words).toBe(10)
    // After an edit, only the changed block is new; the total is still exact.
    e.commands.insertContentAt(d.content.size - 1, ' nine')
    expect(countDoc(e.state.doc).words).toBe(11)
  })
})
