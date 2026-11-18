# MySlides file format

Format version 1. The name and the `.myslides` extension are placeholders until the product is named.

A deck is one `.myslides` file: a standard ZIP archive holding a readable JSON file and the deck's pictures. Nothing in it is encrypted, compiled, or tied to this app. Anyone with an unzip tool and a text editor can get every word, number and picture out of a deck, with or without MySlides.

The machine-readable definition is [`deck.schema.json`](deck.schema.json) (JSON Schema 2020-12). It is generated from the same definitions the app validates with (`src/deck/schema.ts`), and a test fails if the two ever differ.

## Container

| Path in the ZIP | What it is |
| --- | --- |
| `deck.json` | The whole deck as UTF-8 JSON, indented two spaces |
| `media/` | Pictures, each named by a hash of its bytes: `media/<16 hex digits>.<jpg, png, webp or gif>`. A picture used on several slides is stored once |
| `README.txt` | A few lines saying what the file is and how to look inside |

Rename the file to `.zip` and any unzip tool opens it. Pictures are stored uncompressed inside the ZIP (they are compressed already); `deck.json` and `README.txt` are deflated. The MIME type is `application/vnd.myslides+zip`.

## deck.json

```json
{
  "format": "myslides",
  "formatVersion": 1,
  "app": { "name": "MySlides", "version": "0.1.0" },
  "meta": { "title": "Cell Division", "created": "2026-11-18T14:02:00.000Z", "modified": "2026-11-18T15:40:00.000Z" },
  "size": { "width": 1280, "height": 720 },
  "theme": {
    "id": "plain",
    "colors": { "background": "#FFFFFF", "text": "#1F2933", "heading": "#0B3C5D",
                "accent1": "#1F7A8C", "accent2": "#E07A5F", "accent3": "#81B29A",
                "accent4": "#F2CC8F", "accent5": "#3D405B", "accent6": "#9A8C98" },
    "fonts": { "heading": "Carlito", "body": "Arimo" }
  },
  "slides": [ { "id": "s1", "layout": "title", "background": null, "transition": "none", "notes": "", "elements": [] } ]
}
```

### Top level

| Field | Type | Meaning |
| --- | --- | --- |
| `format` | `"myslides"` | Always this. A file without it is not a deck |
| `formatVersion` | whole number ≥ 1 | See Versioning |
| `app` | object, optional | `name` and `version` of the app that last saved the deck. Informational only |
| `meta.title` | string | The deck's title (may be empty) |
| `meta.created`, `meta.modified` | ISO 8601 date-time strings, optional | When the deck was created, and last saved |
| `size` | `{ width, height }` | How many slide units a slide is. Version 1 always writes 1280 × 720 (16:9) |
| `theme` | object | The deck's whole theme, written out in full (not just its id), so the deck looks right even if a later app drops that theme |
| `slides` | array, at least one | The slides, in order |

### Theme

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | The theme it came from |
| `colors` | object | Nine colors, each `#RRGGBB`: `background`, `text`, `heading`, `accent1` to `accent6` |
| `fonts.heading`, `fonts.body` | strings | Font family names. The app bundles Tinos, Arimo and Carlito (SIL OFL), plus theme fonts added in a later version |

### Slide

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `id` | string | | Unique within the deck |
| `layout` | string | `"blank"` | The layout the slide was made from (`title`, `section`, `title-content`, `two-columns`, `title-only`, `blank`). Placeholders keep their `role` |
| `background` | color | `null` | Slide background; `null` uses the theme's `background` |
| `transition` | `"none"`, `"fade"`, `"slide"` | `"none"` | How this slide appears when presenting |
| `notes` | string | `""` | Speaker notes, plain text. Line breaks are `\n` |
| `elements` | array | `[]` | What is on the slide. Drawn in array order: later elements sit on top |

### Elements

Every element has an `id` (unique within the deck), a `type`, and a box: `x`, `y` (top left corner) and `w`, `h`, all in slide units with the origin at the slide's top left. `w` and `h` are never negative; a line or arrow may have `h` of 0.

**`text`**: a text box.

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `role` | string, optional | | Placeholder role from the layout: `title`, `subtitle`, `body`, ... Absent for boxes the student added |
| `verticalAlign` | `"top"`, `"middle"`, `"bottom"` | `"top"` | Where the text sits in the box |
| `content` | rich text | | See Rich text |

**`image`**: a picture.

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `src` | string | | Its file in the ZIP: `media/<16 hex digits>.<ext>` |
| `alt` | string | `""` | Alternative text for screen readers |

Pictures are JPEG, PNG, WebP or GIF (first frame only). SVG is not accepted in version 1. The app shrinks pictures to at most 1920 pixels on the long side when they are inserted.

**`shape`**

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `shape` | `"rect"`, `"round-rect"`, `"ellipse"`, `"triangle"`, `"line"`, `"arrow"` | | Which shape |
| `fill` | color | `null` | Inside color; `null` for none |
| `stroke` | color | `null` | Outline color; `null` for none |
| `strokeWidth` | number, 0 to 50 | `2` | Outline width in slide units |
| `flipH` | boolean, optional | `false` | Lines and arrows only. A line runs from the box's top left corner to its bottom right; `flipH` starts it at the top right instead |
| `flipV` | boolean, optional | `false` | Lines and arrows only. Starts the line at the bottom instead of the top. With both, bottom right to top left. An arrow's head is at the end |

**`table`**

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `headerRow` | boolean | `true` | The first row is a header, styled from the theme |
| `columnWidths` | numbers, 1 to 10 | | Width of each column in slide units |
| `rows` | array, 1 to 20 | | Each row is `{ "cells": [...] }` with exactly one cell per column |

A cell is `{ "content": <rich text>, "fill": <color>, "align": "left" | "center" | "right" }` (defaults: `fill` null, `align` left). There are no merged cells and no formulas.

**`chart`**

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `chartType` | `"bar"`, `"line"`, `"pie"` | | Pie charts use the first series only |
| `title` | string | `""` | Shown above the chart when not empty |
| `alt` | string | `""` | Alternative text for screen readers |
| `categories` | strings, 1 to 12 | | The labels along the axis (or the pie's slices) |
| `series` | array, 1 to 6 | | Each is `{ "name": string, "values": [...] }` with exactly one value per category. A value is a number, or `null` for an empty cell |
| `options.legend` | boolean | `true` | Show the legend |
| `options.xTitle`, `options.yTitle` | strings | `""` | Axis titles; empty for none |

No chart colors are stored: series take the theme's accent colors in order (`accent1` for the first series, and so on).

### Colors

A color is one of:

- a hex string, `#RRGGBB`;
- a theme slot name (`background`, `text`, `heading`, `accent1` to `accent6`), which follows the theme when it changes;
- `null`, for none.

### Rich text

Text boxes and table cells hold rich text as editor JSON (the same format MyDocs uses): a `doc` node whose `content` is a list of nodes. Version 1 allows only these:

| Nodes | |
| --- | --- |
| `doc` | The root |
| `paragraph` | Optional `attrs`: `textAlign` (`left`, `center`, `right`, `justify`), `lineHeight` |
| `text` | `text` string, optional `marks` |
| `hardBreak` | A line break inside a paragraph |
| `bulletList`, `orderedList`, `listItem` | Lists; a list item holds paragraphs and nested lists |

| Marks | |
| --- | --- |
| `bold`, `italic`, `underline`, `strike` | |
| `textStyle` | `attrs`: `color`, `fontFamily`, `fontSize` |
| `highlight` | `attrs`: `color` |
| `link` | `attrs`: `href` |

A text box or cell using any other node or mark counts as damaged (see below).

### Ids

Ids are strings with no meaning beyond being unique in the deck. If a file has duplicates, the app gives the extras new ids when it opens the file.

## Reading rules

- **Unknown fields are kept.** A reader ignores fields it does not know and keeps going. The app also writes them back unchanged when it saves, so a deck made by a newer app (same `formatVersion`) survives being opened and saved by an older one.
- **A damaged element** (wrong field types, a value outside the limits above, rich text with unknown nodes, or a picture missing from `media/`) does not stop the deck from opening. It shows as a labeled gray box in its place, and its original JSON is written back exactly as it was on save.
- **A damaged slide setting** (for example an unknown `transition`) is reset to its default, and the student is told.
- **A damaged theme** is replaced by the plain theme, and the student is told.
- **A file that is not a deck at all**, cannot be unzipped, or has unreadable `deck.json` is refused with a plain-words message, and nothing is opened halfway.

## Versioning

- `formatVersion` is a whole number. Adding optional fields does not change it. Anything that would make an older reader show a deck wrong (a new element type, a changed meaning) bumps it.
- A file with a higher version than the app understands is refused with a clear message ("made with a newer version of MySlides"), and the file is left untouched.
- The app can always open every older version.

## Local backups (not part of the file)

While a deck is open, the app keeps a backup on the device, in IndexedDB, so a crash loses at most a couple of seconds of work:

- Database `myslides`, store `backups`: the deck JSON (without pictures) for each open deck, latest plus the last 10 versions.
- Database `myslides-media`, store `images`: each picture once, keyed by its `media/...` path. Pictures no backup points at are removed.

Nothing leaves the device.
