import { baseName, safeFileName } from '@mysuite/core/file-access'
import { FILE_EXTENSION } from './container'
import { UNTITLED } from './session'

test('file names lose every character Windows, macOS and ChromeOS refuse', () => {
  expect(safeFileName('Bio: cells/division?', UNTITLED)).toBe('Bio cellsdivision')
  expect(safeFileName('back\\slash *star* "quote" <a|b>', UNTITLED)).toBe('backslash star quote ab')
  expect(safeFileName('tab\there\u0000nul\u001fend', UNTITLED)).toBe('tabherenulend')
  expect(safeFileName('Trailing dots...', UNTITLED)).toBe('Trailing dots')
  expect(safeFileName('  ...  ', UNTITLED)).toBe('Untitled deck')
})

test('the deck extension comes off the file name, in any case', () => {
  expect(baseName('Cell Division.myslides', FILE_EXTENSION)).toBe('Cell Division')
  expect(baseName('LOUD.MYSLIDES', FILE_EXTENSION)).toBe('LOUD')
  expect(baseName('notes.txt', FILE_EXTENSION)).toBe('notes.txt')
})
