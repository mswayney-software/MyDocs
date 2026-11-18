# Reuse audit (MySlides Phase 0)

Written 18 Nov 2026 from the MyDocs code at v1.1.0 (commit `0bee071`), against the MySlides v1 spec. Where the spec and the code disagree, the code wins for shared parts (spec working rule), and the difference is noted here.

## Decisions taken before Phase 0

- All eight spec recommendations accepted: one repo with shared packages; ZIP container; browser print for PDF with a Letter fallback; Present plus Presenter view; images shrunk to 1920 px on insert; 16:9 only; two extra SIL OFL theme fonts; name and extension still placeholders.
- **License:** both apps move from MIT to PolyForm Noncommercial 1.0.0. The spec's "proprietary" and decision 1 (one repo) collided with MyDocs being public and MIT. The source stays public and free to use for noncommercial purposes; commercial rights stay with the author. Releases up to 1.1.0 remain available under MIT to anyone who already has them.
- **ZIP library:** MyDocs already ships `jszip` (used for Word export), so the deck container reuses it instead of adding `fflate`. That means no new dependency.

## What MyDocs does today

| Area | As built | Spec assumed | Consequence for MySlides |
| --- | --- | --- | --- |
| Native file format | One JSON file, `.owdoc`, `{ format: "mydocs", version: 1, page, doc }`, images embedded as data URLs (`src/files/native.ts`). Legacy format id `open-writer` still read | Open question | Decks differ on purpose (ZIP + `media/`, decision 2). The parse pattern carries over: typed `OpenError` with kinds `not-ours`, `newer-version`, `damaged` and student-facing messages |
| Distribution | PWA only (vite-plugin-pwa, Workbox `generateSW`), deployed to GitHub Pages from `pages.yml` after CI passes. No installer | Open question | MySlides is a second PWA with its own manifest, icons, scope and `file_handlers` entry |
| Updates | `registerType: 'prompt'`; a waiting version applies by itself while the page is blank, otherwise a top-bar restart button (`src/offline.ts`) | Not covered | Shared as is. Add a "presenting" check so no update banner ever appears during Present (spec: nothing interrupts a presentation) |
| Offline enforcement | Production builds inject a strict CSP meta tag (`default-src 'self'`); no runtime caching rules | "Zero network requests" | Shared plugin. Deck images are blobs, so `img-src blob:` (already allowed) covers them |
| Print and PDF | Browser print dialog with a generated `@page` rule (paper, margins, margin boxes for header, footer, page numbers). Firefox and Safari don't print margin boxes, so the student is warned before printing | Same idea | The approach carries over; the code does not. MyDocs print is paper-and-margin specific. MySlides needs `size: 13.333in 7.5in; margin: 0` and one slide per page. Print-test results below |
| Print headers in the browser | Work in Chrome and Edge 131+ via margin boxes. Not in Firefox and Safari | Open question | Not needed for slides |
| App state | No state library. `DocumentSession` is a plain class with `subscribe`/`getState` read through `useSyncExternalStore`; the Tiptap editor owns the document and its undo | "Whatever MyDocs uses; if none, Zustand + Immer" | MyDocs has no deck-like state to reuse, so MySlides adds Zustand + Immer for the deck store and patch-based history (spec stack table) |
| Backups | IndexedDB via idb-keyval, store `mydocs/backups`; `snap:<id>` latest plus `hist:<id>` last 10, at most one per 30 s; Web Locks mark live tabs so recovery only offers orphaned work; persistent storage requested on first edit | Same rules | Shared, parameterized by database and lock name. MyDocs keeps `mydocs` so existing students' backups survive the move. MySlides adds a separate image-blob store keyed by hash (Phase 1) |
| Open and save | browser-fs-access: write back in Chrome and Edge, hidden file input plus download in Firefox and Safari, with a 500 ms cancel grace for Firefox | Same | Shared, parameterized by file types. Save takes a `Blob` so the ZIP deck goes through the same path |
| Image insert | Downscale to **1600 px** long edge, JPEG 0.85 for photos, PNG kept for PNG and GIF; small web images under 300 KB kept as is; output is a data URL | 1920 px, blobs | Shared function takes the max edge and returns a `Blob`. MyDocs keeps 1600 px and data URLs |
| Fonts | Tinos, Arimo, Carlito (SIL OFL, Fontsource), metric-compatible with Times New Roman, Arial and Calibri; old Liberation names mapped on open | Example `deck.json` used "Liberation Sans" | Spec example is wrong; decks name the bundled families. Theme fonts (decision 7) are added on top |
| Dark mode | Screen-only; the page inverts by CSS filter so printed output never changes; stored in `localStorage` `mydocs:theme` | Not covered | Shared. Both apps live on the same origin (GitHub Pages), so they share the setting, which is the desired behaviour |
| Tests | Vitest + jsdom (55 unit tests), Playwright on Chromium and Firefox, axe-core WCAG 2.1 AA scan, 50-page typing perf test with 4x CPU slowdown, offline start test | Same toolchain | MySlides copies the setup. Safari (WebKit) is not in CI for either app |
| Folders | `src/editor`, `src/files`, `src/storage`, `src/templates`, `src/ui`, plus `e2e`, `scripts` | `packages/core` + `apps/*` | Adopted below |

## How the code is split

Layout after Phase 0:

```
apps/docs/      MyDocs, unchanged in behaviour (was the repo root)
apps/slides/    MySlides, an empty shell in Phase 0
packages/core/  code both apps use, consumed as TypeScript source (no build step)
docs/           suite-wide docs (this audit, the print test)
scripts/        license check across every workspace
```

Moved to `packages/core` in Phase 0. These have no MyDocs-specific logic, or only constants that become parameters:

| Module | From | Change needed |
| --- | --- | --- |
| Offline and update state | `src/offline.ts` | None |
| Backups and tab locks | `src/storage/autosave.ts` | Database and lock names become parameters |
| File open and save | `src/files/fileAccess.ts` | File types become parameters; save accepts a `Blob` |
| Image downscale and picker | `src/files/images.ts` | Max edge parameter; returns a `Blob` with a data-URL helper for MyDocs. `fitToPage` stays in MyDocs |
| Bundled fonts and aliases | `src/editor/fonts.ts` and the font CSS imports | None |
| Screen appearance | `src/ui/appearance.ts` | None |
| Shortcut labels | `src/ui/shortcuts.ts` | None |
| Popover, menu item, swatch picker | `src/ui/Popover.tsx`, `MenuItem.tsx`, `SwatchPicker.tsx` | None |
| Promise dialogs | `src/ui/dialogTypes.ts`, `DialogView.tsx`, `useDialogs.tsx` | None |
| CSP plugin and PWA defaults | `vite.config.ts` | Extracted into a shared config helper |
| Base styles and design tokens | Top of `src/index.css` | Tokens, reset, focus, dialog, menu and toolbar button styles split into `core/styles.css` |

**Deliberately not moved yet: the text editor setup.** The spec puts it in Phase 0. It moves in Phase 2 instead, when MySlides mounts its first text box. Today's extensions (`src/editor/*`) mix paper-specific pieces (page break, title, trailing paragraph, find and replace) with general ones (text style, links, paragraph format). Where to cut them depends on which marks and nodes a text box allows (spec File format: paragraphs, lists, links, inline formatting), and that is easier to get right with the consumer in hand than to guess now. Same reasoning for `Toolbar.tsx` and `useFormatState.ts`: MySlides needs a single context-switching toolbar row, so the shared part is the formatting controls, not the bar.

Stays in MyDocs: Word import and export, page setup and print rules, templates, word count, find bar, typewriter light, sheet and margin preview, the document session.

## Differences from the spec

1. **Images:** MyDocs shrinks to 1600 px; MySlides uses 1920 px per decision 5. The shared function takes the size, and each app keeps its own.
2. **Editor sharing moves to Phase 2** (above).
3. **`deck.json` example fonts:** "Liberation Sans" should read "Arimo" (or a theme font).
4. **ZIP library:** `jszip` (already shipped) instead of `fflate`.
5. **Safari:** neither app's CI runs WebKit. Safari results in this audit come from a manual run.
6. **License:** PolyForm Noncommercial 1.0.0, not "proprietary, closed" and not MIT. The license checker's allowlist for *dependencies* is unchanged.
7. **Format docs location** (Phase 1): `apps/slides/docs/FILE_FORMAT.md` and `apps/slides/docs/deck.schema.json`, not the repository's `docs/`, which holds MyDocs' own `FILE_FORMAT.md`.
8. **Deck state** (Phase 1): a plain session class like MyDocs' `DocumentSession`.
9. **Undo without Zustand or patches** (Phase 2): decks are immutable (edits go through Immer 11.2.9, MIT), so each undo step keeps the previous deck, and steps share every slide and element that didn't change. Same memory goal as patches, one dependency fewer. Capped at 100 steps; a drag, a resize, or a run of arrow-key nudges is one step.
10. **Editor sharing** (Phase 2): text styling (`text-style.ts`) and link safety (`links.ts`) moved to `packages/core/src/editor`; MyDocs keeps one-line re-exports at the old paths, so none of its files or tests changed. The paper-specific extensions (paragraph indents and spacing, page break, title, find) stay in MyDocs. MySlides has its own small paragraph line-spacing extension writing the same `lineHeight` attribute as MyDocs.
11. **Strikethrough is Ctrl+Shift+X in MySlides**, because Ctrl+Shift+S is Save as. See the MyDocs bug below.

## Found in Phase 2

- **MyDocs bug, live today:** Ctrl+Shift+S both strikes through the selected text and opens Save as. The editor's shortcut and the app's Save as share the key, and ProseMirror's handling doesn't stop the app from seeing it. Confirmed in Firefox (the strike lands and the Save as dialog opens) and in Chromium (the strike lands). Not fixed: it changes a MyDocs shortcut, so it waits for a decision.
- **MyDocs test `rich.spec.ts:115`** (Backspace below a table, Delete above it): failed in 2 of 5 full runs on the current code, in Chromium only, and passed in all 3 runs of the pre-Phase-1 code. It passes 11 of 11 when run on its own, and in a back-to-back comparison both versions passed every run. It is timing-sensitive under load; whether the shared-code changes made it more so is not settled.

## Print test (decision 3)

The test page is `apps/slides/public/print-test.html`. It is one 16:9 slide per page with `@page { size: 13.333in 7.5in; margin: 0 }`, a page-size ruler, and a bar chart in SVG and text to check sharpness.

Results are filled in below.

| Browser | How it was run | Pages | Page size | Result |
| --- | --- | --- | --- | --- |
| Chrome (desktop, Windows) | Headless `--print-to-pdf` | 3 | 13.333 × 7.5 in, every page | Pass. One slide per page, edge to edge, all four corners intact, text selectable, chart is vector |
| Edge (desktop, Windows) | Headless `--print-to-pdf` | 3 | 13.333 × 7.5 in, every page | Pass, same as Chrome |
| Firefox | **Needs a manual run** through the print dialog | | | |
| Safari (iPhone, iOS) | Print dialog, by the maintainer, 18 Nov 2026 | 3 | **US Letter portrait**: the slide size is ignored | Partial. One slide per page (page breaks work), but each slide sits at the top of a tall page with two thirds left blank. The right edge is clipped, confirmed in a second preview: the right-hand corner squares and right border are missing, and the last chart bar runs into the cut, so roughly the last inch of each slide is lost. Safari also prints its own header and footer (URL, date, "Page n of 3") |
| Safari (Mac) | **Not tested**; the iPhone uses the same WebKit engine, so expect the same | | | |

The headless runs show what the engine does with the `@page` rule. They skip the print dialog itself, which is where Firefox has been reported to go wrong (spec, decision 3). To finish the table: open `print-test.html` from the MySlides dev server (`npm run dev -w myslides`, then `/print-test.html`), choose Save as PDF, leave settings at their defaults, and note the page count and page size from the PDF's document properties. Add a screenshot of those properties for each browser.

**What this means for Phase 7.** The fallback cannot assume the browser uses the slide size or a known paper size. In browsers that ignore `@page size`, each slide must scale to the printable width the browser actually gives it (CSS units relative to the page, not fixed inches), so nothing is clipped. Before printing, a plain-words note tells the student to choose Landscape and turn off headers and footers. The Firefox result will confirm whether this applies there too.

Decision 3 is already taken (browser print, Letter fallback where needed), so these results set how the fallback is detected in Phase 7. They do not reopen the decision.

## Found along the way

- **Hosting both apps on one site.** MyDocs is served at `/MyDocs/` with a service worker whose scope is `/MyDocs/`. If MySlides is published under it (`/MyDocs/slides/`), the MyDocs worker would catch MySlides page loads and serve MyDocs instead. Before MySlides goes live: give MyDocs' Workbox config a `navigateFallbackDenylist` for the MySlides path, or publish MySlides at its own path or domain. Nothing is published yet; `pages.yml` still deploys MyDocs alone.
- **The MyDocs dark-mode typing test has almost no headroom.** On the development PC it measures p95 48 ms against a 50 ms limit, on the 1.1.0 code and on this branch alike (three alternating runs each, identical numbers). A busy machine tips it over. This is not caused by the restructure, but it will flake in CI. Options: run the perf project with one worker, or look at what the typewriter light costs per keystroke.
- **Dev and preview servers lock the source folder on Windows.** Two leftover MyDocs servers (ports 5173 and 4173) had to be stopped before files could move.

## Phase 0 checklist

| Done when | Status |
| --- | --- |
| Audit written and reviewed | Written (this file). Waiting on review |
| MyDocs builds and every existing test passes, no test edited | Unit 55/55. Browser: all 129 functional tests pass (5 skipped, as before). The two typing-speed tests pass when run alone. In two full-suite runs, the dark-mode one failed once at p95 56 ms (limit 50); the 1.1.0 code measures the same on this PC (see above). Lint, typecheck and license check pass. The precache count is unchanged (114 entries). No MyDocs test file was changed |
| MySlides boots to an empty shell, installs as its own app, zero network requests after first load | Pass in Chromium and Firefox: 12 browser tests including an accessibility scan in light and dark, plus a unit test. Own manifest id, icons and scope; the CSP blocks other sites; offline reload makes no network requests. App download 105 KiB compressed (budget 2 MB) |
| Print test results in the audit, with a screenshot of the PDF page size per browser | Chrome, Edge and iPhone Safari done. Firefox still needs a manual run (above) |
