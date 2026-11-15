# Open Writer (working title)

A free, open source word processor for high school and college students that runs entirely on your device. No account, no sign-in, no telemetry. Your files stay on your computer.

Status: M6 (Word files) done. Opens .docx as a new copy and saves as .docx. Headers, footers and page numbers print in Chrome and Edge 131+; Firefox and Safari print size and margins only (no CSS margin boxes yet). See the v1 spec for scope and milestones.

## Develop

```sh
npm install
npx playwright install chromium firefox
npm run dev        # local dev server
npm test           # unit tests (Vitest)
npm run test:e2e   # end-to-end tests (Playwright, Chromium + Firefox)
npm run lint       # oxlint
npm run typecheck  # tsc
npm run licenses   # check dependency licenses, regenerate THIRD_PARTY_LICENSES.md
node scripts/fetch-sample-papers.mjs  # real school papers for the Word import tests (optional)
```

The Word import tests also run against ten real sample papers from university writing centers, listed with their sources in `e2e/fixtures/sample-papers.json`. They belong to their schools, so they are not in the repository; the fetch script downloads them, and the tests skip any that are missing. Set `EXPORT_OUT=<folder>` when running `e2e/docx.spec.ts` to keep every exported .docx for a look in Word or LibreOffice.

## Layout

- `src/editor`: editor setup and extensions
- `src/files`: native file, Word import and export, print
- `src/storage`: autosave
- `src/ui`: shell, toolbar, menus, dialogs
- `src/templates`: Blank, MLA, APA

## License

MIT. Third-party licenses are listed in `THIRD_PARTY_LICENSES.md`. Allowed dependency licenses: MIT, BSD, Apache-2.0, ISC, SIL OFL, and Zlib (approved for pako, used by JSZip). Anything else is flagged before install.
