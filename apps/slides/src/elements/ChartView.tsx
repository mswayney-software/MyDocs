import { memo, useMemo } from 'react'
import type { Theme } from '../deck/schema'
import { chartLayout, type ChartData } from './chart-layout'

/** A chart drawn as SVG at its size in slide units. */
export const ChartSvg = memo(function ChartSvg({ chart, theme, width, height }: { chart: ChartData; theme: Theme; width: number; height: number }) {
  const { marks } = useMemo(() => chartLayout(chart, theme, width, height), [chart, theme, width, height])
  const font = `'${theme.fonts.body}', sans-serif`
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} fontFamily={font} overflow="hidden" aria-hidden="true">
      {marks.map((m, i) => {
        switch (m.kind) {
          case 'rect':
            return <rect key={i} x={m.x} y={m.y} width={Math.max(0, m.w)} height={Math.max(0, m.h)} fill={m.fill} />
          case 'line':
            return <line key={i} x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} stroke={m.stroke} strokeWidth={m.width} />
          case 'path':
            return <path key={i} d={m.d} fill={m.fill} stroke={m.stroke} strokeWidth={m.width} strokeLinejoin="round" strokeLinecap="round" />
          case 'circle':
            return <circle key={i} cx={m.cx} cy={m.cy} r={m.r} fill={m.fill} stroke={m.stroke} strokeWidth={m.width} />
          case 'text':
            return (
              <text
                key={i}
                x={m.x}
                y={m.y}
                fontSize={m.size}
                fontWeight={m.weight}
                textAnchor={m.anchor}
                dominantBaseline="central"
                fill={m.fill}
                transform={m.rotate ? `rotate(${m.rotate} ${m.x} ${m.y})` : undefined}
              >
                {m.text}
              </text>
            )
        }
      })}
    </svg>
  )
})
