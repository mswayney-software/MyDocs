import { fileOpen, fileSave, supported, type FileWithHandle } from 'browser-fs-access'
import { FILE_DESCRIPTION, FILE_EXTENSION, FILE_MIME } from './native'

/**
 * True where the browser can write back to the file it opened (Chrome, Edge).
 * Firefox and Safari fall back to opening with a file input and saving by download.
 */
export const canWriteBack = supported

const FILE_TYPES = { description: FILE_DESCRIPTION, extensions: [FILE_EXTENSION], mimeTypes: [FILE_MIME] }

export interface OpenedFile {
  name: string
  text: string
  handle: FileSystemFileHandle | null
}

/** Show the open dialog. Resolves null if the user cancels. */
export async function openFile(): Promise<OpenedFile | null> {
  let file: FileWithHandle | null
  try {
    file = canWriteBack ? await fileOpen({ ...FILE_TYPES, id: 'documents' }) : await pickWithInput()
  } catch (err) {
    if (isCancel(err)) return null
    throw err
  }
  if (!file) return null
  return { name: file.name, text: await file.text(), handle: file.handle ?? null }
}

/** How long a "cancel" waits for a "change" that follows it. */
const CANCEL_GRACE_MS = 500

/**
 * Open through a hidden file input (Firefox, Safari). Some setups (Firefox under test
 * automation, at least) fire "cancel" and then "change" for one pick, so a cancel only
 * counts once no file has arrived shortly after it.
 */
function pickWithInput(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = [FILE_EXTENSION, FILE_MIME].join(',')
    input.style.display = 'none'
    document.body.append(input)
    let settled = false
    const finish = (file: File | null) => {
      if (settled) return
      settled = true
      input.remove()
      resolve(file)
    }
    input.addEventListener('change', () => finish(input.files?.[0] ?? null))
    input.addEventListener('cancel', () => setTimeout(() => finish(input.files?.[0] ?? null), CANCEL_GRACE_MS))
    if ('showPicker' in HTMLInputElement.prototype) input.showPicker()
    else input.click()
  })
}

export type SaveResult =
  | { kind: 'written'; handle: FileSystemFileHandle; name: string }
  | { kind: 'downloaded'; name: string }
  | { kind: 'cancelled' }

/**
 * Save the text. With a handle (Chrome, Edge) this writes over the open file; without one
 * it shows the save dialog, or, in browsers without one, downloads a copy.
 */
export async function saveFile(
  text: string,
  fileName: string,
  handle: FileSystemFileHandle | null,
): Promise<SaveResult> {
  const blob = new Blob([text], { type: FILE_MIME })
  if (handle && canWriteBack) {
    try {
      await ensureWritePermission(handle)
      const written = await fileSave(blob, { ...FILE_TYPES, fileName }, handle, true)
      if (written) return { kind: 'written', handle: written, name: written.name }
    } catch (err) {
      if (isCancel(err)) return { kind: 'cancelled' }
      // The file was moved, deleted, or permission was refused: fall through to Save as.
    }
  }
  try {
    const written = await fileSave(blob, { ...FILE_TYPES, fileName, id: 'documents' })
    if (written) return { kind: 'written', handle: written, name: written.name }
    return { kind: 'downloaded', name: fileName }
  } catch (err) {
    if (isCancel(err)) return { kind: 'cancelled' }
    throw err
  }
}

/** A handle restored after a crash needs permission again before it can be written. */
async function ensureWritePermission(handle: FileSystemFileHandle) {
  type WithPermission = FileSystemFileHandle & {
    queryPermission?: (d: { mode: 'readwrite' }) => Promise<PermissionState>
    requestPermission?: (d: { mode: 'readwrite' }) => Promise<PermissionState>
  }
  const h = handle as WithPermission
  if (!h.queryPermission || !h.requestPermission) return
  if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return
  if ((await h.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('permission denied')
}

function isCancel(err: unknown) {
  return err instanceof DOMException && err.name === 'AbortError'
}
