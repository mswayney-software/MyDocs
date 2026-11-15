# The .owdoc file format

A MyDocs document is one UTF-8 JSON file with the extension `.owdoc` and the media type `application/vnd.mydocs+json`. Everything is inside it, images included, so a single file can be emailed, moved, or backed up.

```json
{
  "format": "mydocs",
  "version": 1,
  "page": {
    "paperSize": "letter",
    "margins": { "top": 1, "right": 1, "bottom": 1, "left": 1 },
    "header": "",
    "headerAlign": "left",
    "footer": "",
    "footerAlign": "center",
    "pageNumbers": "header-right",
    "pageNumberPrefix": "Smith"
  },
  "doc": { "type": "doc", "content": [ ... ] }
}
```

## Fields

- **format**: always `"mydocs"`. Files saved before the app was named MyDocs say `"open-writer"`; both are read.
- **version**: the format version, currently `1`. A file with a newer version than the app understands is refused with a message asking to update the app, never half-read.
- **page**: page settings.
  - `paperSize`: `"letter"` or `"a4"`.
  - `margins`: inches, each between 0.25 and 3.
  - `header` and `footer`: one line of text each. `headerAlign` and `footerAlign`: `"left"`, `"center"` or `"right"`.
  - `pageNumbers`: `"none"`, `"header-right"`, `"footer-center"` or `"footer-right"`. `pageNumberPrefix` is printed before the number (MLA: the student's last name).
  - Unknown keys are kept when the file is saved again, so a newer app's settings survive a round trip through an older one.
- **doc**: the editor's document as ProseMirror JSON. Node types: `paragraph`, `title`, `heading` (levels 1 to 3), `bulletList`, `orderedList`, `listItem`, `blockquote`, `table`, `tableRow`, `tableHeader`, `tableCell`, `image`, `pageBreak`, `hardBreak`, `text`. Marks: `bold`, `italic`, `underline`, `strike`, `superscript`, `subscript`, `textStyle` (font, size, color), `highlight`, `link`.

## Rules when reading

- The document is checked against the editor's schema; anything it can't represent makes the file count as damaged rather than being silently dropped.
- Images must be embedded (`data:image/...;base64`). An image that points at a web address is removed, because opening a document must never contact the internet.
- Font names from before the fonts were bundled ("Liberation Serif", "Times New Roman") map to the bundled equivalents.
