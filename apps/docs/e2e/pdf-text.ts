export interface Item { str: string; x: number; y: number; w: number; h: number }

/** The text on each page of a PDF, with positions in points from the bottom left. */
export async function pdfText(pdf: Buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const file = await pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: false, isEvalSupported: false }).promise
  const pages: { width: number; height: number; items: Item[] }[] = []
  for (let n = 1; n <= file.numPages; n++) {
    const p = await file.getPage(n)
    const [, , width, height] = p.view
    const content = await p.getTextContent()
    const items = content.items
      .filter((i): i is typeof i & { str: string; transform: number[]; width: number; height: number } => 'str' in i && i.str.trim() !== '')
      .map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: i.height }))
    pages.push({ width, height, items })
  }
  return pages
}
