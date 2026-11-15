# Contributing

Thanks for helping. MyDocs is small on purpose: it does a school paper well before anything else. Before starting something big, open an issue to talk it through.

## Getting set up

```sh
npm install
npx playwright install chromium firefox
npm run dev
```

## Before you open a pull request

```sh
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run licenses
```

All of them must pass. Add tests with the change, in the same commit: a unit test for logic, a browser test (in `e2e/`) for anything a student does.

## Rules

- **Offline first.** Nothing may make a network request after the app loads: no analytics, no web fonts, no images or scripts from other sites. The content security policy will block them anyway.
- **No account, no telemetry.** Ever.
- **Licenses.** Only MIT, BSD, Apache-2.0, ISC, SIL OFL and Zlib dependencies ship in the app; `npm run licenses` checks this. Ask in an issue before adding any dependency. Tiptap Pro packages are not allowed (separate paid license); only the MIT core and MIT extensions.
- **Our own design.** Don't copy Microsoft Word's ribbon, icons, or layout.
- **Plain words.** Every message a student sees says what happened and what to do, in everyday language.
- **Accessibility.** Full keyboard access, visible focus, labels on every control, WCAG AA contrast. The accessibility scan in `e2e/a11y.spec.ts` must stay clean.
- **Never lose typing.** If a change touches focus, dialogs, or file actions, test that keys typed right afterwards land in the document.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the code fits together.
