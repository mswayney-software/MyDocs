import { normalizeLink } from '@mysuite/core/editor/links'
import type { Ask } from '@mysuite/core/dialog-types'
import type { Editor } from '@tiptap/core'

/** Ctrl+K: add a link to the selection, edit the link under the cursor, or remove it. */
export async function editLinkDialog(editor: Editor, ask: Ask) {
  const run = () => editor.chain().focus()
  const inLink = editor.isActive('link')
  const current = (editor.getAttributes('link').href as string | undefined) ?? ''
  const a = await ask({
    title: current ? 'Edit link' : 'Add link',
    fields: [{ key: 'href', label: 'Web or email address', value: current, placeholder: 'example.com' }],
    buttons: [
      ...(current ? [{ label: 'Remove link', value: 'remove' }] : []),
      { label: 'Cancel', value: 'cancel' },
      { label: 'OK', value: 'ok', primary: true },
    ],
    cancelValue: 'cancel',
  })
  if (a.value === 'remove') run().extendMarkRange('link').unsetLink().run()
  if (a.value !== 'ok') return void editor.commands.focus()
  const href = normalizeLink(a.values.href ?? '')
  if (!href) {
    await ask({ title: 'That address can’t be a link', body: 'Use a web address (example.com) or an email address.', buttons: [{ label: 'OK', value: 'ok', primary: true }], cancelValue: 'ok' })
    return void editor.commands.focus()
  }
  if (editor.state.selection.empty && !inLink) run().insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run()
  else run().extendMarkRange('link').setLink({ href }).run()
}
