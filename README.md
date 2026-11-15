# MyDocs

A free, open source word processor for high school and college students. It runs entirely on your device: no account, no sign-in, no tracking, and your files never leave your computer. It covers everything a school paper needs, MLA and APA included, and nothing else.

![MyDocs with a new MLA paper open](docs/screenshot.png)

## What it does

- **Write and format.** Fonts that match Times New Roman, Arial and Calibri, sizes, bold, italic, underline, strikethrough, superscript, subscript, color, highlight. Title and three heading levels, bulleted and numbered lists, block quotes, alignment, line spacing (1, 1.15, 1.5, 2), space before and after, indents, first-line and hanging indents.
- **Tables, images, links.** Insert tables, add and remove rows and columns, merge cells, header rows. Insert images from a file, by pasting or by dragging; resize and align them. Links to web pages and email addresses.
- **School paper templates.** File > New from template sets up an MLA paper or an APA student paper: heading or title page, running header with your last name and page number, double spacing, and a Works Cited or References page.
- **Page setup and printing.** Letter or A4, margins, header, footer, and page numbers, including MLA's "Smith 3". Print, or save as PDF from the print window.
- **Word files.** Open a .docx (it opens as a copy; the original is never changed) and save as a Word file to hand in or share. Exports are checked in Google Docs and LibreOffice.
- **Tools.** Undo and redo, find and replace, word and character count, your browser's spell check, zoom, and the usual keyboard shortcuts (Ctrl+B, Ctrl+S, Ctrl+P and so on).
- **Never lose work.** Everything you type is backed up on your device within a second. If the browser or computer crashes, MyDocs offers your work back the next time it opens.
- **Works offline.** After the first visit, the whole app runs with no internet. In Chrome or Edge you can install it as an app with its own window.

## Using it

MyDocs is a web app: open it in Chrome, Edge, Firefox or Safari. It isn't hosted anywhere yet; to try it, run it locally (below).

- **Saving.** In Chrome and Edge, Ctrl+S saves back to the file you opened. Firefox and Safari can't write to files on your computer, so Ctrl+S downloads a copy instead, and the app tells you so.
- **Files.** Documents are saved as `.owdoc` files, a single file with everything in it, images included. Use File > Save as Word file for a `.docx`.
- **Printing headers and page numbers.** Chrome and Edge (version 131 or newer) print headers, footers and page numbers. Firefox and Safari print the right paper size and margins but can't print headers or page numbers yet; the app warns before printing. For MLA and APA papers, print from Chrome or Edge, or save as a Word file.

## Privacy

MyDocs has no server. It makes no network requests after it loads: no analytics, no fonts or images from the web, no accounts. The app's content security policy blocks any request to another site, so this is enforced by the browser, not just promised. Your documents and their backups stay on your device. Details in [SECURITY.md](SECURITY.md).

## Develop

Requires Node.js 24.

```sh
npm install
npx playwright install chromium firefox
npm run dev        # local dev server
npm run build      # production build in dist/
npm run preview    # serve the production build (with offline support)
npm test           # unit tests (Vitest)
npm run test:e2e   # browser tests (Playwright, Chromium and Firefox), accessibility scan, typing speed
npm run lint       # oxlint
npm run typecheck  # tsc
npm run licenses   # check dependency licenses, regenerate THIRD_PARTY_LICENSES.md
node scripts/fetch-sample-papers.mjs  # real school papers for the Word import tests (optional)
```

The Word import tests also run against ten real sample papers from university writing centers, listed with their sources in `e2e/fixtures/sample-papers.json`. They belong to their schools, so they are not in this repository; the fetch script downloads them, and the tests skip any that are missing. Set `EXPORT_OUT=<folder>` when running `e2e/docx.spec.ts` to keep every exported .docx for a look in Word, Google Docs or LibreOffice.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the code fits together, [docs/FILE_FORMAT.md](docs/FILE_FORMAT.md) for the `.owdoc` format, [docs/ROADMAP.md](docs/ROADMAP.md) for what's next, and [CONTRIBUTING.md](CONTRIBUTING.md) to help.

## Built with

[Tiptap](https://tiptap.dev) (MIT core only) on [ProseMirror](https://prosemirror.net), React, Vite and TypeScript. [docx](https://github.com/dolanmiu/docx) writes Word files and [mammoth](https://github.com/mwilliamson/mammoth.js) reads them. [browser-fs-access](https://github.com/GoogleChromeLabs/browser-fs-access), [idb-keyval](https://github.com/jakearchibald/idb-keyval), [vite-plugin-pwa](https://vite-pwa-org.netlify.app), [Lucide](https://lucide.dev) icons, and the Tinos, Arimo and Carlito fonts via [Fontsource](https://fontsource.org).

## License

MIT. Third-party licenses are listed in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md). Allowed dependency licenses: MIT, BSD, Apache-2.0, ISC, SIL OFL, and Zlib (for pako, used by JSZip). One test-only exception: axe-core (MPL-2.0), the accessibility scanner, which never ships in the app.
