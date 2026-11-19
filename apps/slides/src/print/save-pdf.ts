import type { Ask } from '@mysuite/core/dialog-types'
import type { PageMode } from './print'

const TIP_KEY = 'myslides:pdf-tip-hidden'

const tipHidden = () => {
  try {
    return localStorage.getItem(TIP_KEY) === '1'
  } catch {
    return false
  }
}
const hideTip = () => {
  try {
    localStorage.setItem(TIP_KEY, '1')
  } catch {
    // Storage blocked: the tip shows again next time, which is harmless.
  }
}

/** What the student is told before the print window opens, in plain words (spec, UI). */
export const PDF_STEPS = {
  exact: 'In the print window, set Destination to “Save as PDF”, then choose Save. Each slide becomes one page, the size of the slide.',
  fit:
    'This browser can’t make pages the size of your slides, so each slide is scaled to fit the paper, one slide per page. ' +
    'In the print window, set Destination (or Printer) to “Save as PDF”, choose Landscape, and turn off Headers and footers if you see that setting. ' +
    'Chrome and Edge make pages exactly the size of your slides.',
} as const

/**
 * The note before the print window. In Chrome and Edge it is a tip the student can turn off; in
 * other browsers it always shows, because the result depends on what they choose there.
 * Resolves true to go on to the print window.
 */
export async function confirmSavePdf(ask: Ask, mode: PageMode): Promise<boolean> {
  if (mode === 'exact' && tipHidden()) return true
  const a = await ask({
    title: 'Save as PDF',
    body: PDF_STEPS[mode],
    fields: mode === 'exact' ? [{ key: 'hide', label: 'Don’t show this again', value: 'false', type: 'checkbox' }] : undefined,
    buttons: [
      { label: 'Cancel', value: 'cancel' },
      { label: 'Continue', value: 'print', primary: true },
    ],
    cancelValue: 'cancel',
  })
  if (a.value !== 'print') return false
  if (a.values.hide === 'true') hideTip()
  return true
}
