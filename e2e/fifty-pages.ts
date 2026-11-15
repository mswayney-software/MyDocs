import type { Page } from '@playwright/test'

/** About 50 printed pages: headings, paragraphs, lists, tables, images. */
export async function fiftyPages(page: Page) {
  return page.evaluate(() => {
    const words =
      'industrial cities grew quickly as factories drew families from farms and workers into crowded neighborhoods where reformers ' +
      'asked who was responsible for clean water safe housing and schools for children whose parents worked long shifts '
    const text = (n: number) => words.repeat(Math.ceil(n / 30)).split(' ').slice(0, n).join(' ') + '.'
    const c = document.createElement('canvas')
    c.width = 400
    c.height = 250
    const g = c.getContext('2d')!
    g.fillStyle = '#2f6db5'
    g.fillRect(0, 0, 400, 250)
    const png = c.toDataURL('image/png')
    const html: string[] = []
    for (let ch = 1; ch <= 25; ch++) {
      html.push(`<h1>Chapter ${ch}</h1>`)
      for (let i = 0; i < 9; i++) html.push(`<p style="text-indent: 0.5in">${text(110)}</p>`)
      html.push(`<ul><li><p>${text(12)}</p></li><li><p>${text(12)}</p></li><li><p>${text(12)}</p></li></ul>`)
      if (ch % 3 === 0) html.push(`<table><tr><th><p>Year</p></th><th><p>People</p></th></tr><tr><td><p>1850</p></td><td><p>120,000</p></td></tr><tr><td><p>1900</p></td><td><p>480,000</p></td></tr></table>`)
      if (ch % 5 === 0) html.push(`<img src="${png}" alt="chart" width="400" height="250">`)
    }
    html.push('<p>The end.</p>')
    const ed = window.__openWriter!
    ed.commands.setContent(html.join(''), { emitUpdate: true })
    const d = ed.state.doc
    return d.textBetween(0, d.content.size, ' ', ' ').split(/\s+/).filter(Boolean).length
  })
}
