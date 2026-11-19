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
11. **Strikethrough is Ctrl+Shift+X in both apps**, because Ctrl+Shift+S is Save as. One shared extension, `packages/core/src/editor/strike.ts`. See the MyDocs bug below.
12. **Theme fonts** (Phase 3, decision 7): Atkinson Hyperlegible (sans, designed for legibility) and Lora (serif), both SIL OFL 1.1 from Fontsource 5.3.0, MySlides only, Latin and Latin Extended subsets. MyDocs' fonts stay as they are, since they match the widths of the fonts schools ask for.
13. **Lines and arrows have a direction** (Phase 3): the spec's box (`x`, `y`, `w`, `h` never negative) can only describe a line from top left to bottom right. Two optional fields, `flipH` and `flipV`, give the other three directions. Optional fields don't change `formatVersion` (spec, Versioning). Format doc and JSON Schema updated.
14. **GIFs** (Phase 3): the spec says first frame only. The shared image shrinker kept small GIFs as they were (MyDocs still does), which would animate on a slide; it now takes a `stillGif` option, and MySlides stores every GIF as a PNG of its first frame.
15. **PNG photos stay PNG** (Phase 3): decision 5 says PNG is kept "when the image has transparency". The shared shrinker keeps every PNG as PNG (MyDocs' behavior) without checking for transparency. A PNG photo is stored larger than a JPEG would be, still at 1920 px or less. Not changed, since it is shared code and only costs size.
16. **Menus** (Phase 3): the spec's UI lists five menus (File, Insert, Format, Arrange, Slide). Only File exists; everything new is on the one toolbar row, within two clicks (Layout, Theme, Background, Picture, Shape, Arrange). The other four menus are left for the polish phase.
17. **No dnd-kit** (Phase 4): the spec's stack lists dnd-kit for reordering slides. It isn't used, so it isn't installed. The strip and the sorter draw only the thumbnails on screen (spec: thumbnails render only when on screen), and dnd-kit knows only the items that are drawn: dragging or pressing Ctrl+Down past the edge of the screen would need work-arounds. Every thumbnail is the same size, so where a slide would drop comes from the pointer position by arithmetic (`apps/slides/src/sorter/order.ts`, unit-tested). Pointer drag (with auto-scroll near the edges, Esc to cancel), keyboard moves and the screen-reader announcements ("Slide moved to position 5 of 60") are about 150 lines of our own code. One dependency fewer.
18. **Slide picking and shortcuts** (Phase 4): the spec gives the sorter multi-select; the strip has it too, since both are the same component. Ctrl+click, Shift+click, Shift+arrows, Ctrl+A. Moving: Ctrl+arrows, Ctrl+Home and Ctrl+End; drag. Ctrl+D duplicates the picked slides in the strip and sorter, and on the canvas when no element is selected (with elements selected it still duplicates them). The slide menu adds Duplicate, Move earlier and Move later to New and Delete.
19. **Sorter entry** (Phase 4): the spec doesn't say where the sorter opens from. It is a "Slide sorter" button in the status bar (one click); Enter or double-click opens a slide in the editor, Esc goes back.
20. **Notes undo** (Phase 4): each keystroke as its own undo step would make Ctrl+Z useless, so a run of typing with pauses under a second is one step. Ctrl+Z inside the notes box is the deck's undo (the browser's own text undo would disagree with the deck). The pane folds away; whether it is open is remembered on the device only.
21. **Stress deck pictures** (Phase 4): the script draws its pictures as PNGs (Node has no JPEG encoder, and the spec allows no image library). They are 1920 px wide like stored photos, about 180 KB each, 5.4 MB for the deck. A browser decodes them to the same number of pixels as photos, which is what memory and drawing cost depend on. Tables are drawn in their basic form and charts as labeled placeholders until Phase 6, so the stress timings must be taken again after Phase 6.

## Found in Phase 2

- **MyDocs bug, live in 1.1.0:** Ctrl+Shift+S both strikes through the selected text and opens Save as. The editor's shortcut and the app's Save as share the key, and ProseMirror's handling doesn't stop the app from seeing it. Confirmed in Firefox (the strike lands and the Save as dialog opens) and in Chromium (the strike lands). **Fixed on this branch** (approved by the maintainer, 18 Nov 2026): strikethrough moved to Ctrl+Shift+X, as in Google Docs, in both apps. A new MyDocs browser test checks that Save as leaves the text alone and that Ctrl+Shift+X strikes and unstrikes. Goes live when the branch is merged (CHANGELOG, Unreleased).
- **MyDocs test `rich.spec.ts:115`** (Backspace below a table, Delete above it) fails because of a **real MyDocs bug, also in 1.1.0: in Chrome, Ctrl+Home pressed inside a table cell does nothing** (the cursor stays in the cell; from ordinary text it works). The editor leaves Ctrl+Home to the browser, and Chromium's own handling only sometimes leaves the table. Not caused by the shared code: on 18 Nov 2026 it passed 60 of 60 on both MyDocs 1.1.0 and this branch in one session, then failed 5 of 5 on 1.1.0, on this branch, and on the branch with today's changes reverted, all in a later session on the same machine. A probe confirmed the cursor doesn't move. **Fixed on this branch** (approved by the maintainer, 18 Nov 2026): the editor handles Ctrl+Home and Ctrl+End itself (`apps/docs/src/editor/document-edges.ts`), with Shift to select. New browser test; without the fix it fails in Chrome and Firefox alike. In CI on the draft pull request, three other MyDocs tests (`view.spec.ts:19`, `zoom.spec.ts:13`, `files.spec.ts:201`) failed once and passed on retry; they passed 30 of 30 locally, and the backup and recovery code they wait on is line-for-line the 1.1.0 code.

## Phase 3 checklist

| Done when | Status |
| --- | --- |
| A 12-megapixel photo inserts in under 2 seconds on the target machine, stored at 1920 px or less | Stored at 1920 x 1440 (checked by a test, which also reopens it). Time from choosing the file to the picture on the slide, measured inside the page on the development PC: Firefox 0.12 to 0.35 s; Chrome 1.1 to 1.2 s. Calling the same insert directly in Chrome takes 0.15 s. The extra second appears only with the test tool's file dialog, and waiting longer after the dialog doesn't shorten it; switching the encoder and reading the file into memory first changed nothing (both reverted). **Not measured on a 4 GB laptop**, the spec's target machine: there isn't one here |
| Switching theme restyles every slide, and Ctrl+Z restores the old theme in one step | Pass, Chrome and Firefox: every slide's background, heading color and font change; one Ctrl+Z restores them with the slides untouched |
| Every theme passes AA contrast for body text and headings on its background | Pass: unit test per theme. Lowest body text 11.9:1 (Chalk), lowest heading 7.3:1 (Ember), against 4.5:1 |
| Each element type has an end-to-end test and survives save and reopen | Text (Phase 2), pictures, all six shapes: pass in Chrome and Firefox. Tables and charts are Phase 6 |

Also in Phase 3: six layouts (switching never drops typed text), slide background from theme or standard colors, drag a box to select, align (to the slide for one item), distribute, stacking order, alt text, paste and drop of pictures. MySlides: 47 unit tests and 57 browser tests pass (1 skipped: Chrome-only save in place). MyDocs, rerun because shared code changed: 55 unit, 133 browser tests pass (5 skipped as before).

**Firefox and pasting pictures in tests:** Firefox empties clipboard events made by a script and gives test automation no clipboard, so the paste step runs in Chrome only (a real paste through the system clipboard). In Firefox the test drops the picture instead, which goes through the same code after the clipboard.

**Found in Phase 3:** a corner handle dragged straight sideways didn't shrink a picture (proportions followed the edge that grew, never the one that shrank). Fixed, with a unit test.

## Phase 4 checklist

| Done when | Status |
| --- | --- |
| A 60-slide deck reorders by drag and by keyboard, and undo restores the order | Pass, Chrome and Firefox (60 plain slides): in the strip, Ctrl+End, Ctrl+Up three times, and three slides picked with Shift+Down moved by Ctrl+Home, then five undos restore the exact order; a drag in the strip and a two-slide drag in the sorter that scrolls itself to the end of the deck, two undos restore it. On the stress deck in Chrome: a drag, Ctrl+End and Ctrl+Up (a whole row), three undos restore it |
| Scrolling the sorter on the stress deck stays smooth on the target machine | Development PC, Chrome, scrolling top to bottom and back at 40 px a frame (a fast wheel): sorter 60 frames a second, slowest frame 17 ms; strip the same. With Chrome slowing the processor four times, as a stand-in for a weak laptop: 59 frames a second, slowest frame 33 ms, none over 50 ms. Only the thumbnails on screen are drawn (under 40 of 60 in the sorter, under 20 in the strip, checked by tests). **Not measured on a 4 GB laptop**, the target machine: there isn't one here. To try it there: `npm run stress-deck -w apps/slides` writes `stress-deck.myslides`; open it and press Slide sorter |
| Notes save, reopen, and undo like everything else | Pass, Chrome and Firefox: two runs of typing are two undo steps, Ctrl+Z and Ctrl+Y work in the notes box, undo from the strip reaches the notes and shows their slide, and each slide's notes come back after save and reopen |

Also in Phase 4: duplicate slides (copies get new ids, so editing a copy leaves the original alone), delete several slides at once (a deck always keeps one), the stress deck script (`apps/slides/scripts/stress-deck.ts`, 60 slides, 30 pictures, 10 tables, 10 charts, notes on every slide), and an accessibility scan of the sorter and the slide menu. Opening the stress deck took 0.6 s on the development PC (budget 3 s). MySlides: 58 unit tests and 69 browser tests pass (3 skipped: the Chrome-only save in place, and the two stress tests in Firefox, which time frames with a Chrome-only tool). No shared code changed, so MyDocs was not rerun.

**Found in Phase 4:** redo returned to the slide that was showing when undo was pressed, not the slide the change was on (undo a change to slide 2's notes from slide 1, redo, and slide 1 showed again). Redo now shows the changed slide, as undo does. Two older canvas tests assumed the slide's size on screen (it is smaller now, with the notes pane under it); they now work at any size.

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

- **Hosting both apps on one site.** MyDocs is served at `/MyDocs/` with a service worker whose scope is `/MyDocs/`. If MySlides is published under it (`/MyDocs/slides/`), the MyDocs worker would catch MySlides page loads and serve MyDocs instead. **Done (Phase 2):** MyDocs' Workbox config now has a `navigateFallbackDenylist` for `slides/`, and `pages.yml` builds MySlides into `/MyDocs/slides/`. Nothing changes on the live site until the branch is merged; the repository only lets `main` deploy to Pages.
- **The MyDocs dark-mode typing test has almost no headroom.** On the development PC it measures p95 48 ms against a 50 ms limit, on the 1.1.0 code and on this branch alike (three alternating runs each, identical numbers). A busy machine tips it over. This is not caused by the restructure, but it will flake in CI. Options: run the perf project with one worker, or look at what the typewriter light costs per keystroke.
- **Dev and preview servers lock the source folder on Windows.** Two leftover MyDocs servers (ports 5173 and 4173) had to be stopped before files could move.

## Phase 0 checklist

| Done when | Status |
| --- | --- |
| Audit written and reviewed | Written (this file). Waiting on review |
| MyDocs builds and every existing test passes, no test edited | Unit 55/55. Browser: all 129 functional tests pass (5 skipped, as before). The two typing-speed tests pass when run alone. In two full-suite runs, the dark-mode one failed once at p95 56 ms (limit 50); the 1.1.0 code measures the same on this PC (see above). Lint, typecheck and license check pass. The precache count is unchanged (114 entries). No MyDocs test file was changed |
| MySlides boots to an empty shell, installs as its own app, zero network requests after first load | Pass in Chromium and Firefox: 12 browser tests including an accessibility scan in light and dark, plus a unit test. Own manifest id, icons and scope; the CSP blocks other sites; offline reload makes no network requests. App download 105 KiB compressed (budget 2 MB) |
| Print test results in the audit, with a screenshot of the PDF page size per browser | Chrome, Edge and iPhone Safari done. Firefox still needs a manual run (above) |
