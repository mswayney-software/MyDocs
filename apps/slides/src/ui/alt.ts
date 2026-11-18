import type { Ask } from '@mysuite/core/dialog-types'
import type { CanvasController } from '../canvas/controller'
import type { ImageElement } from '../deck/schema'

/** Alt text for a picture: what a screen reader says instead of showing it. */
export async function editAltText(controller: CanvasController, el: ImageElement, ask: Ask) {
  const a = await ask({
    title: 'Alt text',
    body: 'Describe the picture for someone who can’t see it. Screen readers read this aloud.',
    fields: [{ key: 'alt', label: 'Description', value: el.alt, maxLength: 500, placeholder: 'A dividing cell under a microscope' }],
    buttons: [
      { label: 'Cancel', value: 'cancel' },
      { label: 'OK', value: 'ok', primary: true },
    ],
    cancelValue: 'cancel',
  })
  if (a.value === 'ok') controller.setAlt(el.id, a.values.alt ?? '')
}
