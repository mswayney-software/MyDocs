# Open Writer (working title)

A free, open source word processor for high school and college students that runs entirely on your device. No account, no sign-in, no telemetry. Your files stay on your computer.

Status: M2 (files and safety) done. See the v1 spec for scope and milestones.

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
```

## Layout

- `src/editor`: editor setup and extensions
- `src/files`: native file, Word import and export, print
- `src/storage`: autosave
- `src/ui`: shell, toolbar, menus, dialogs
- `src/templates`: Blank, MLA, APA

## License

MIT. Third-party licenses are listed in `THIRD_PARTY_LICENSES.md`. Allowed dependency licenses: MIT, BSD, Apache-2.0, ISC, SIL OFL. Anything else is flagged before install.
