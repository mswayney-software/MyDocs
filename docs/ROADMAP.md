# Roadmap

v1 covers everything a student needs to write, format, and hand in a paper. Next, roughly in order:

## Planned

- **PDF built in the app, for Firefox and Safari.** Those browsers can't print headers, footers or page numbers from a web page (no CSS page margin boxes). Building the PDF inside the app would give every browser the same printed page.
- **A custom domain.** The app is live on GitHub Pages; a short domain of its own would be easier to share with students.
- **Live page view while typing.** Pages, headers, footers and page numbers are applied when printing and exporting today. Showing real pages while typing is the largest v2 item.

## Parked for v2

- Footnotes, endnotes, a citation and works cited helper, a table of contents
- Comments
- A desktop installer (Tauri) if students ask for a classic download; the installable web app covers this for now

## Known limits of Word import

- Footnotes come in as a numbered list at the end of the document.
- Right indents and EMF/WMF clip art are left out.
- A Word list that starts at a number other than 1 restarts at 1.
- In unusual files (text boxes, for example), formatting on individual words falls back to the document's main font.
