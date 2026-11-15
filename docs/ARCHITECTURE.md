# Architecture

MyDocs is static files that run in the browser. There is no backend to build, host, or go down.

## The document model

The editor (Tiptap on ProseMirror) holds the document as JSON. Next to it, a small page settings object holds paper size, margins, header, footer and page numbers. Everything else reads from or writes to these two:

- **Native file** (`src/files/native.ts`): one JSON file with a format id and version, the page settings, and the document, images embedded as data URLs. See [FILE_FORMAT.md](FILE_FORMAT.md).
- **Backups** (`src/storage/autosave.ts`): the same JSON in IndexedDB, written within a second of any change, plus the last 10 versions. A Web Lock marks which documents belong to an open tab, so crash recovery offers only work from tabs that are gone.
- **Word export** (`src/files/docx-export.ts`): walks the document JSON and builds the .docx directly with the `docx` library, using the same sizes and spacing the editor shows. Headers carry a live PAGE field.
- **Word import** (`src/files/docx-import.ts`, `docx-xml.ts`): mammoth turns the .docx into HTML, which the editor reads like a paste. What mammoth leaves out (alignment, indents, spacing, fonts, colors, page breaks, paper, margins, header, footer, page numbers) is read from the file's XML and matched to mammoth's paragraphs and runs by position, only when the counts line up exactly.
- **Print and PDF** (`src/files/print.ts`): a generated `@page` rule sets the paper and margins, and its margin boxes print the header, footer and page numbers. The browser's print window does the rest.
- **Offline** (`src/offline.ts`, `vite.config.ts`): a Workbox service worker caches the app, code and fonts on first load. A new version applies by itself while the page is blank; otherwise the top bar offers a restart.

## Folders

- `src/editor`: editor setup and custom extensions (title, paragraph formatting, page break, find and replace, image, table edges, word count)
- `src/files`: native file, Word import and export, print, the document session (open, save, backup, recovery)
- `src/storage`: IndexedDB backups and locks
- `src/templates`: Blank, MLA paper, APA student paper
- `src/ui`: top bar, menus, toolbar, dialogs, find bar, status bar
- `e2e`: browser tests (Playwright), including the accessibility scan and the 50-page typing test
- `scripts`: license check, icon generation, sample paper download

## Principles in the code

- **Never lose typing.** Focus moves to the document synchronously after every dialog and menu, file actions never wait on storage before swapping documents, and backups are written within a second.
- **No network.** A content security policy in production builds blocks requests to any other site; images from web pages are refused; links open only on Ctrl+click.
- **Plain words.** Messages say what happened and what to do, without format jargon.

## Tests

- Unit tests (Vitest, jsdom) for the file format, Word XML reading and writing, print rules, editor commands.
- Browser tests (Playwright, Chromium and Firefox) for every feature, kill-the-tab recovery, offline start with the network off, MLA printing checked in the PDF, Word round trips, and real sample papers.
- An axe-core accessibility scan (WCAG 2.1 A and AA) of every screen, menu and dialog.
- A typing test in a 50-page document with the CPU slowed 4x, run after the others so nothing competes for the CPU.
