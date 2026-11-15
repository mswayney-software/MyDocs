import { getSchema } from '@tiptap/core'
import { createExtensions } from '../editor/extensions'
import {
  baseName, DEFAULT_PAGE, FORMAT_VERSION, OpenError, parse, safeFileName, serialize, type NativeDocument,
} from './native'

const schema = getSchema(createExtensions())
const sample: NativeDocument = {
  page: { ...DEFAULT_PAGE, paperSize: 'a4', header: 'Smith' },
  doc: {
    type: 'doc',
    content: [
      { type: 'title', attrs: { textAlign: 'center' }, content: [{ type: 'text', text: 'My Paper' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Body', marks: [{ type: 'bold' }] }] },
    ],
  },
}

const errorKind = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    return e instanceof OpenError ? e.kind : 'other'
  }
  return 'none'
}

describe('native file format', () => {
  it('round trips the document and page settings exactly', () => {
    const text = serialize(sample)
    expect(JSON.parse(text)).toMatchObject({ format: 'open-writer', version: FORMAT_VERSION })
    expect(parse(text, schema)).toEqual(sample)
  })

  it('maps font names from before the fonts were bundled', () => {
    const old = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [
        { type: 'text', text: 'a', marks: [{ type: 'textStyle', attrs: { fontFamily: 'Liberation Sans', fontSize: null, color: null } }] },
        { type: 'text', text: 'b', marks: [{ type: 'textStyle', attrs: { fontFamily: 'Liberation Serif', fontSize: null, color: null } }] },
      ] }],
    }
    const text = JSON.stringify({ format: 'open-writer', version: 1, doc: old })
    const fonts = parse(text, schema).doc.content![0].content!.map((t) => t.marks![0].attrs!.fontFamily)
    expect(fonts).toEqual(['Arimo', 'Tinos'])
  })

  it('keeps unknown page settings, so a round trip never drops data', () => {
    const text = JSON.stringify({ format: 'open-writer', version: 1, page: { futureThing: 7 }, doc: sample.doc })
    expect(parse(text, schema).page).toMatchObject({ futureThing: 7, paperSize: 'letter' })
  })

  it('fills in default page settings when they are missing or invalid', () => {
    const text = JSON.stringify({ format: 'open-writer', version: 1, page: { margins: { top: 'x' } }, doc: sample.doc })
    expect(parse(text, schema).page).toMatchObject({ margins: DEFAULT_PAGE.margins, pageNumbers: 'none' })
  })

  it('explains, rather than crashes on, a file from a newer version', () => {
    const text = JSON.stringify({ format: 'open-writer', version: FORMAT_VERSION + 1, doc: { type: 'doc' } })
    expect(errorKind(() => parse(text, schema))).toBe('newer-version')
    expect(() => parse(text, schema)).toThrow(/newer version/)
  })

  it('rejects files that are not ours', () => {
    expect(errorKind(() => parse('not json at all', schema))).toBe('not-ours')
    expect(errorKind(() => parse('{"hello": 1}', schema))).toBe('not-ours')
    expect(errorKind(() => parse('[]', schema))).toBe('not-ours')
  })

  it('rejects damaged files instead of opening half a document', () => {
    const bad = (doc: unknown, version: unknown = 1) => JSON.stringify({ format: 'open-writer', version, doc })
    expect(errorKind(() => parse(bad({ type: 'doc', content: [{ type: 'spaceship' }] }), schema))).toBe('damaged')
    expect(errorKind(() => parse(bad({ type: 'doc', content: [{ type: 'text', text: 'loose' }] }), schema))).toBe('damaged')
    expect(errorKind(() => parse(bad(null), schema))).toBe('damaged')
    expect(errorKind(() => parse(bad(sample.doc, 'one'), schema))).toBe('damaged')
  })
})

describe('file names', () => {
  it('strips the extension for display', () => {
    expect(baseName('Essay.owdoc')).toBe('Essay')
    expect(baseName('Essay.OWDOC')).toBe('Essay')
    expect(baseName('notes.txt')).toBe('notes.txt')
  })

  it('removes characters that operating systems refuse', () => {
    expect(safeFileName('Essay: draft 2/3?')).toBe('Essay draft 23')
    expect(safeFileName('  ...  ')).toBe('Untitled document')
    expect(safeFileName('Report.')).toBe('Report')
  })
})
