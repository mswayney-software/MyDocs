import type { DocumentSession } from '../files/session'
import { TEMPLATES } from '../templates'
import type { Ask } from '@mysuite/core/dialog-types'

/** File > New from template: pick MLA or APA, fill in the first-page details, start writing. */
export async function newFromTemplate(session: DocumentSession, ask: Ask) {
  const pick = await ask({
    title: 'New from template',
    body: 'Starts a new document with the page setup, header, and first page already laid out.',
    fields: [
      {
        key: 'template',
        label: 'Template',
        value: 'mla',
        type: 'select',
        options: TEMPLATES.map((t) => ({ value: t.id, label: t.label })),
      },
    ],
    buttons: [
      { label: 'Cancel', value: 'cancel' },
      { label: 'Next', value: 'next', primary: true },
    ],
    cancelValue: 'cancel',
  })
  if (pick.value !== 'next') return
  const template = TEMPLATES.find((t) => t.id === pick.values.template) ?? TEMPLATES[0]
  if (!template.fields.length) return session.newDocument()

  const details = await ask({
    title: template.label,
    body: 'Fill in what you know now. You can change any of it later in the document.',
    fields: template.fields,
    buttons: [
      { label: 'Cancel', value: 'cancel' },
      { label: 'Create', value: 'create', primary: true },
    ],
    cancelValue: 'cancel',
  })
  if (details.value !== 'create') return
  const made = template.build(details.values, new Date())
  await session.newFromTemplate(made, details.values.title?.trim() || 'Untitled document')
}
