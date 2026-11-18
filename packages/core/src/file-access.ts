import { fileOpen, fileSave, supported, type FileWithHandle } from 'browser-fs-access'

/**
 * Opening and saving files on the student's device. Each app passes its own file types.
 *
 * True where the browser can write back to the file it opened (Chrome, Edge).
 * Firefox and Safari fall back to opening with a file input and saving by download.
 */
export const canWriteBack = supported

export interface FileTypes {
  description: string
  extensions: string[]
  mimeTypes: string[]
}

export interface OpenedFile {
  name: string
  file: File
  handle: FileSystemFileHandle | null
}

export type SaveResult =
  | { kind: 'written'; handle: FileSystemFileHandle; name: string }
  | { kind: 'downloaded'; name: string }
  | { kind: 'cancelled' }

/** Show the open dialog. Resolves null if the user cancels. */
export async function openFile(types: FileTypes): Promise<OpenedFile | null> {
  let file: FileWithHandle | null
  try {
    file = canWriteBack
      ? await fileOpen({ ...types, id: 'documents' })
      : await pickFileWithInput([...types.extensions, ...types.mimeTypes].join(','))
  } catch (err) {
    if (isCancel(err)) return null
    throw err
  }
  if (!file) return null
  return { name: file.name, file, handle: file.handle ?? null }
}

/** How long a "cancel" waits for a "change" that follows it. */
const CANCEL_GRACE_MS = 500

/**
 * Pick one file through a hidden file input (Firefox, Safari, and image pickers). Some setups
 * (Firefox under test automation, at least) fire "cancel" and then "change" for one pick, so
 * a cancel only counts once no file has arrived shortly after it.
 */
export function pickFileWithInput(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
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

/**
 * Save the file. With a handle (Chrome, Edge) this writes over the open file; without one
 * it shows the save dialog, or, in browsers without one, downloads a copy.
 */
export async function saveFile(
  blob: Blob,
  types: FileTypes,
  fileName: string,
  handle: FileSystemFileHandle | null,
): Promise<SaveResult> {
  if (handle && canWriteBack) {
    try {
      await ensureWritePermission(handle)
      const written = await fileSave(blob, { ...types, fileName }, handle, true)
      if (written) return { kind: 'written', handle: written, name: written.name }
    } catch (err) {
      if (isCancel(err)) return { kind: 'cancelled' }
      // The file was moved, deleted, or permission was refused: fall through to Save as.
    }
  }
  try {
    const written = await fileSave(blob, { ...types, fileName, id: 'documents' })
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

/**
 * Save an exported file (Word, and later others). Never touches the open file: in Chrome
 * and Edge it shows the save dialog, elsewhere it downloads.
 */
export async function exportFile(
  blob: Blob,
  types: FileTypes,
  fileName: string,
): Promise<'written' | 'downloaded' | 'cancelled'> {
  try {
    const written = await fileSave(blob, { ...types, fileName, id: 'exports' })
    return written ? 'written' : 'downloaded'
  } catch (err) {
    if (isCancel(err)) return 'cancelled'
    throw err
  }
}
