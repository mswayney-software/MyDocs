export interface DialogButton {
  label: string
  value: string
  primary?: boolean
}

export interface DialogField {
  key: string
  label: string
  value: string
  type?: 'text' | 'number' | 'checkbox'
  /** Text shown after the field, such as a file extension. */
  suffix?: string
  min?: number
  max?: number
  placeholder?: string
}

export interface DialogSpec {
  title: string
  body?: string
  fields?: DialogField[]
  buttons: DialogButton[]
  /** Answer used when the dialog is dismissed with Escape. */
  cancelValue: string
}

export interface DialogAnswer {
  /** The button chosen. */
  value: string
  /** Field values by key; checkboxes are "true" or "false". */
  values: Record<string, string>
}

export type Ask = (spec: DialogSpec) => Promise<DialogAnswer>
