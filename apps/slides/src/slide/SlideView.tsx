import { memo, type CSSProperties } from 'react'
import type { Media } from '../deck/media'
import type { Element, ShapeElement, Slide, TableElement, Theme } from '../deck/schema'
import { isEmptyText, richTextHtml } from '../text/extensions'
import { placeholderHint, resolveColor, textBoxStyle } from './style'

const box = (el: { x: number; y: number; w: number; h: number }): CSSProperties => ({
  left: el.x,
  top: el.y,
  width: el.w,
  height: el.h,
})

const urls = new WeakMap<Blob, string>()
function pictureUrl(blob: Blob | undefined): string | undefined {
  if (!blob) return undefined
  let url = urls.get(blob)
  if (!url) {
    url = URL.createObjectURL(blob)
    urls.set(blob, url)
  }
  return url
}

interface SlideViewProps {
  slide: Slide
  theme: Theme
  media: Media
  /** Editor canvas: empty placeholders show their hint. Everywhere else they show nothing. */
  hints?: boolean
  /** The element being edited live, drawn by the editor instead. */
  hiddenId?: string | null
}

/**
 * One slide, drawn at its full size in slide units (1280 × 720). Callers scale it with a single
 * CSS transform, so zooming never re-lays anything out. Static: no editors, no handlers.
 */
export const SlideView = memo(function SlideView({ slide, theme, media, hints, hiddenId }: SlideViewProps) {
  return (
    <div
      className="slide-surface"
      style={{ background: resolveColor(slide.background, theme) ?? theme.colors.background }}
    >
      {slide.elements.map((el) =>
        el.id === hiddenId ? null : <ElementView key={el.id} el={el} theme={theme} media={media} hints={hints} />,
      )}
    </div>
  )
})

const ElementView = memo(function ElementView({ el, theme, media, hints }: { el: Element; theme: Theme; media: Media; hints?: boolean }) {
  switch (el.type) {
    case 'text': {
      const empty = isEmptyText(el.content)
      return (
        <div className="el el-text" data-id={el.id} style={{ ...box(el), ...textBoxStyle(el, theme) }}>
          {empty ? (
            hints && el.role ? <div className="text-hint">{placeholderHint(el.role)}</div> : null
          ) : (
            <div className="slide-text" dangerouslySetInnerHTML={{ __html: richTextHtml(el.content) }} />
          )}
        </div>
      )
    }
    case 'image':
      return (
        <img className="el el-image" data-id={el.id} style={box(el)} src={pictureUrl(media.get(el.src))} alt={el.alt} draggable={false} />
      )
    case 'shape':
      return <ShapeView el={el} theme={theme} />
    case 'table':
      return <TableView el={el} theme={theme} />
    case 'chart':
      // Drawn from its data in Phase 6.
      return (
        <div className="el el-pending" data-id={el.id} style={box(el)} role="img" aria-label={el.alt || 'Chart'}>
          Chart{el.title ? `: ${el.title}` : ''}
        </div>
      )
    case 'broken':
      return (
        <div className="el el-broken" data-id={el.id} style={box(el)} role="note">
          {el.reason}
        </div>
      )
  }
})

function ShapeView({ el, theme }: { el: ShapeElement; theme: Theme }) {
  const fill = resolveColor(el.fill, theme) ?? 'none'
  const stroke = resolveColor(el.stroke, theme) ?? 'none'
  const sw = el.stroke ? el.strokeWidth : 0
  const { w, h } = el
  const half = sw / 2
  let shape
  switch (el.shape) {
    case 'rect':
      shape = <rect x={half} y={half} width={Math.max(0, w - sw)} height={Math.max(0, h - sw)} />
      break
    case 'round-rect': {
      const r = Math.min(w, h) * 0.15
      shape = <rect x={half} y={half} width={Math.max(0, w - sw)} height={Math.max(0, h - sw)} rx={r} ry={r} />
      break
    }
    case 'ellipse':
      shape = <ellipse cx={w / 2} cy={h / 2} rx={Math.max(0, w / 2 - half)} ry={Math.max(0, h / 2 - half)} />
      break
    case 'triangle':
      shape = <polygon points={`${w / 2},${half} ${w - half},${h - half} ${half},${h - half}`} />
      break
    case 'line':
    case 'arrow': {
      const head = Math.max(10, sw * 3)
      const len = Math.hypot(w, h) || 1
      const end = el.shape === 'arrow' ? { x: w - (w / len) * head * 0.8, y: h - (h / len) * head * 0.8 } : { x: w, y: h }
      shape = (
        <>
          <line x1={0} y1={0} x2={end.x} y2={end.y} stroke={stroke === 'none' ? theme.colors.text : stroke} strokeWidth={Math.max(sw, 1)} />
          {el.shape === 'arrow' && (
            <polygon
              points={arrowHead(w, h, head)}
              fill={stroke === 'none' ? theme.colors.text : stroke}
              stroke="none"
            />
          )}
        </>
      )
      break
    }
  }
  return (
    <svg className="el el-shape" data-id={el.id} style={box(el)} width={Math.max(w, 1)} height={Math.max(h, 1)} overflow="visible" aria-hidden="true">
      <g fill={fill} stroke={stroke} strokeWidth={sw}>{shape}</g>
    </svg>
  )
}

/** A filled triangle at the end of a line from (0,0) to (w,h). */
function arrowHead(w: number, h: number, size: number) {
  const len = Math.hypot(w, h) || 1
  const ux = w / len
  const uy = h / len
  const bx = w - ux * size
  const by = h - uy * size
  const px = -uy * size * 0.5
  const py = ux * size * 0.5
  return `${w},${h} ${bx + px},${by + py} ${bx - px},${by - py}`
}

/** Basic table drawing; its full styling and editing arrive in Phase 6. */
function TableView({ el, theme }: { el: TableElement; theme: Theme }) {
  const total = el.columnWidths.reduce((a, b) => a + b, 0) || 1
  return (
    <table className="el el-table" data-id={el.id} style={{ ...box(el), fontFamily: `'${theme.fonts.body}', sans-serif`, color: theme.colors.text }}>
      <colgroup>
        {el.columnWidths.map((w, i) => (
          <col key={i} style={{ width: `${(w / total) * 100}%` }} />
        ))}
      </colgroup>
      <tbody>
        {el.rows.map((row, r) => (
          <tr key={r}>
            {row.cells.map((cell, c) => {
              const header = el.headerRow && r === 0
              const bg = resolveColor(cell.fill, theme) ?? (header ? theme.colors.accent1 : undefined)
              return (
                <td key={c} style={{ background: bg, textAlign: cell.align, color: header ? '#fff' : undefined, fontWeight: header ? 700 : undefined }}>
                  <div className="slide-text" dangerouslySetInnerHTML={{ __html: richTextHtml(cell.content) }} />
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
