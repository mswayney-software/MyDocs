import * as core from '@mysuite/core/file-access'
import { FILE_DESCRIPTION, FILE_EXTENSION, FILE_MIME } from './native'

export { canWriteBack, type OpenedFile, type SaveResult } from '@mysuite/core/file-access'

export const DOCX_EXTENSION = '.docx'
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const FILE_TYPES = { description: FILE_DESCRIPTION, extensions: [FILE_EXTENSION], mimeTypes: [FILE_MIME] }
const WORD_TYPES = { description: 'Word document', extensions: [DOCX_EXTENSION], mimeTypes: [DOCX_MIME] }
/** Open accepts our documents and Word documents (which open as a copy). */
const OPEN_TYPES = {
  description: 'Documents (MyDocs or Word)',
  extensions: [FILE_EXTENSION, DOCX_EXTENSION],
  mimeTypes: [FILE_MIME, DOCX_MIME],
}

export const isWordFile = (name: string) => name.toLowerCase().endsWith(DOCX_EXTENSION)

/** Show the open dialog. Resolves null if the user cancels. */
export const openFile = () => core.openFile(OPEN_TYPES)

/** Save the document text; see core saveFile for write-back and download behaviour. */
export const saveFile = (text: string, fileName: string, handle: FileSystemFileHandle | null) =>
  core.saveFile(new Blob([text], { type: FILE_MIME }), FILE_TYPES, fileName, handle)

/** Save a Word export. Never touches the open document's own file. */
export const exportFile = (blob: Blob, fileName: string) => core.exportFile(blob, WORD_TYPES, fileName)
