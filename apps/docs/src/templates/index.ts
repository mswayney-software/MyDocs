import type { JSONContent } from '@tiptap/core'
import { DEFAULT_PAGE, type PageSettings } from '../files/native'
import type { DialogField } from '@mysuite/core/dialog-types'

/**
 * Starting documents for the papers students write most: MLA (9th edition) and APA student
 * papers (7th edition). Each asks for the details that go on the first page, then lays out
 * the heading or title page, the running header, and the Works Cited or References page.
 */

export interface Template {
  id: string
  label: string
  /** Details asked for before the document is made; empty = none. */
  fields: DialogField[]
  build: (values: Record<string, string>, today: Date) => TemplateDocument
}

export interface TemplateDocument {
  doc: JSONContent
  page: PageSettings
  /** Text the cursor selects when the document opens, so typing replaces it. */
  select: string
}

export const START_TEXT = 'Start writing here.'

const text = (t: string, bold = false): JSONContent[] =>
  t ? [{ type: 'text', text: t, ...(bold && { marks: [{ type: 'bold' }] }) }] : []

/** A double-spaced paragraph, as both styles require for the whole paper. */
const p = (t: string, attrs: Record<string, unknown> = {}, bold = false): JSONContent => ({
  type: 'paragraph',
  attrs: { lineHeight: 2, ...attrs },
  content: text(t, bold),
})
const centered = (t: string, bold = false) => p(t, { textAlign: 'center' }, bold)
const body = (t: string) => p(t, { firstLine: 0.5 })
/** A works-cited or reference entry: hanging indent. */
const entry = (t: string) => p(t, { indent: 0.5, firstLine: -0.5 })
const pageBreak: JSONContent = { type: 'pageBreak' }

const value = (v: Record<string, string>, key: string, fallback: string) => v[key]?.trim() || fallback

const field = (key: string, label: string, placeholder: string, valueText = ''): DialogField => ({
  key,
  label,
  value: valueText,
  placeholder,
  maxLength: 120,
})

const BLANK: Template = {
  id: 'blank',
  label: 'Blank document',
  fields: [],
  build: () => ({ doc: { type: 'doc', content: [{ type: 'paragraph' }] }, page: structuredClone(DEFAULT_PAGE), select: '' }),
}

/** "15 November 2026". */
const mlaDate = (d: Date) => `${d.getDate()} ${d.toLocaleString('en-US', { month: 'long' })} ${d.getFullYear()}`
/** "November 15, 2026". */
const apaDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

const MLA: Template = {
  id: 'mla',
  label: 'MLA paper',
  fields: [
    field('name', 'Your first and last name', 'Jane Smith'),
    field('instructor', 'Instructor', 'Professor Ruiz'),
    field('course', 'Course', 'English 101'),
    field('title', 'Paper title', 'Title of Your Paper'),
  ],
  build: (v, today) => {
    const name = value(v, 'name', 'Your Name')
    // The running header is the last name and the page number: "Smith 3".
    const lastName = name.split(/\s+/).at(-1) ?? name
    return {
      page: { ...structuredClone(DEFAULT_PAGE), pageNumbers: 'header-right', pageNumberPrefix: lastName },
      select: START_TEXT,
      doc: {
        type: 'doc',
        content: [
          p(name),
          p(value(v, 'instructor', 'Instructor Name')),
          p(value(v, 'course', 'Course')),
          p(mlaDate(today)),
          centered(value(v, 'title', 'Title of Your Paper')),
          body(START_TEXT),
          pageBreak,
          centered('Works Cited'),
          entry('Lastname, Firstname. Title of Source. Publisher, Year.'),
        ],
      },
    }
  },
}

const APA: Template = {
  id: 'apa',
  label: 'APA student paper',
  fields: [
    field('title', 'Paper title', 'Title of Your Paper'),
    field('name', 'Your name', 'Jane Smith'),
    field('school', 'Department and school', 'Department of Psychology, State University'),
    field('course', 'Course number and name', 'PSY 101: Introduction to Psychology'),
    field('instructor', 'Instructor', 'Dr. Ruiz'),
  ],
  build: (v, today) => {
    const title = value(v, 'title', 'Title of Your Paper')
    return {
      // Page numbers at the top right of every page, title page included.
      page: { ...structuredClone(DEFAULT_PAGE), pageNumbers: 'header-right', pageNumberPrefix: '' },
      select: START_TEXT,
      doc: {
        type: 'doc',
        content: [
          // The title sits three or four lines down the title page.
          p(''),
          p(''),
          p(''),
          centered(title, true),
          p(''),
          centered(value(v, 'name', 'Your Name')),
          centered(value(v, 'school', 'Department, School')),
          centered(value(v, 'course', 'Course Number: Course Name')),
          centered(value(v, 'instructor', 'Instructor Name')),
          centered(apaDate(today)),
          pageBreak,
          centered(title, true),
          body(START_TEXT),
          pageBreak,
          centered('References', true),
          entry('Author, A. A. (Year). Title of the work. Publisher.'),
        ],
      },
    }
  },
}

export const TEMPLATES: Template[] = [BLANK, MLA, APA]
