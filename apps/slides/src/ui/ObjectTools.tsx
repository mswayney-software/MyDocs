import { Popover } from '@mysuite/core/ui'
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalDistributeCenter,
  AlignStartHorizontal, AlignStartVertical, AlignVerticalDistributeCenter, ArrowDownToLine, ArrowUpToLine, BringToFront,
  Circle, Layers, Minus, MoveRight, PaintBucket, PenLine, SendToBack, Shapes, Square, SquareRoundCorner, Triangle,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { AlignKind, StackMove } from '../canvas/arrange'
import type { CanvasController } from '../canvas/controller'
import type { Element, ShapeElement, Theme } from '../deck/schema'
import { ColorPicker } from './ColorPicker'

const ICON = { size: 18, strokeWidth: 2, 'aria-hidden': true } as const

/** Menu entries look like the File menu's: icon or blank, label, nothing else. */
function Entry({ label, icon, disabled, onSelect }: { label: string; icon: ReactNode; disabled?: boolean; onSelect: () => void }) {
  return (
    <button type="button" role="menuitem" className="menu-item" disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onSelect}>
      <span className="menu-icon" aria-hidden="true">{icon}</span>
      <span className="menu-label">{label}</span>
    </button>
  )
}

const SHAPE_CHOICES = [
  ['rect', 'Rectangle', <Square key="r" {...ICON} />],
  ['round-rect', 'Rounded rectangle', <SquareRoundCorner key="rr" {...ICON} />],
  ['ellipse', 'Oval', <Circle key="e" {...ICON} />],
  ['triangle', 'Triangle', <Triangle key="t" {...ICON} />],
  ['line', 'Line', <Minus key="l" {...ICON} />],
  ['arrow', 'Arrow', <MoveRight key="a" {...ICON} />],
] as const

/** The Shape button: pick one of the six shapes to add. */
export function ShapeMenu({ controller }: { controller: CanvasController }) {
  return (
    <Popover label="Shape" menu trigger={<Shapes {...ICON} />}>
      {(close) =>
        SHAPE_CHOICES.map(([kind, label, icon]) => (
          <Entry
            key={kind}
            label={label}
            icon={icon}
            onSelect={() => {
              close()
              controller.insertShape(kind)
            }}
          />
        ))
      }
    </Popover>
  )
}

const OUTLINE_WIDTHS = [1, 2, 3, 4, 6, 8, 12, 16] as const

/** Fill, outline color and outline width for the selected shapes. */
export function ShapeStyle({ controller, shapes, theme }: { controller: CanvasController; shapes: ShapeElement[]; theme: Theme }) {
  const first = shapes[0]
  const allLines = shapes.every((s) => s.shape === 'line' || s.shape === 'arrow')
  const same = <K extends keyof ShapeElement>(k: K) => (shapes.every((s) => s[k] === first[k]) ? first[k] : undefined)
  const width = same('strokeWidth')
  return (
    <span className="tb-group" role="group" aria-label="Shape style">
      {!allLines && (
        <ColorPicker
          label="Fill"
          icon={<PaintBucket {...ICON} />}
          current={same('fill') ?? null}
          theme={theme}
          noneLabel="No fill"
          onPick={(fill) => controller.setShapeStyle({ fill })}
        />
      )}
      <ColorPicker
        label={allLines ? 'Line color' : 'Outline'}
        icon={<PenLine {...ICON} />}
        current={same('stroke') ?? null}
        theme={theme}
        noneLabel={allLines ? 'Text color' : 'No outline'}
        onPick={(stroke) => controller.setShapeStyle({ stroke })}
      />
      <select
        className="tb-select"
        aria-label={allLines ? 'Line width' : 'Outline width'}
        title={allLines ? 'Line width' : 'Outline width'}
        value={width ?? ''}
        onChange={(e) => controller.setShapeStyle({ strokeWidth: Number(e.target.value) })}
      >
        {width === undefined && <option value="">Mixed</option>}
        {width !== undefined && !OUTLINE_WIDTHS.includes(width as (typeof OUTLINE_WIDTHS)[number]) && <option value={width}>{width} pt</option>}
        {OUTLINE_WIDTHS.map((w) => (
          <option key={w} value={w}>
            {w} pt
          </option>
        ))}
      </select>
    </span>
  )
}


const ALIGN: [AlignKind, string, ReactNode][] = [
  ['left', 'Align left', <AlignStartVertical key="l" {...ICON} />],
  ['center', 'Align center', <AlignCenterVertical key="c" {...ICON} />],
  ['right', 'Align right', <AlignEndVertical key="r" {...ICON} />],
  ['top', 'Align top', <AlignStartHorizontal key="t" {...ICON} />],
  ['middle', 'Align middle', <AlignCenterHorizontal key="m" {...ICON} />],
  ['bottom', 'Align bottom', <AlignEndHorizontal key="b" {...ICON} />],
]
const STACK: [StackMove, string, ReactNode][] = [
  ['front', 'Bring to front', <BringToFront key="f" {...ICON} />],
  ['forward', 'Bring forward', <ArrowUpToLine key="fw" {...ICON} />],
  ['backward', 'Send backward', <ArrowDownToLine key="bw" {...ICON} />],
  ['back', 'Send to back', <SendToBack key="b" {...ICON} />],
]

/** Arrange: align (to the slide for one item, to each other for several), distribute, stacking order. */
export function ArrangeMenu({ controller, selected }: { controller: CanvasController; selected: Element[] }) {
  const one = selected.length === 1
  return (
    <Popover label="Arrange" menu trigger={<Layers {...ICON} />}>
      {(close) => {
        const pick = (fn: () => void) => () => {
          close()
          fn()
        }
        return (
          <>
            <div className="menu-heading" role="presentation">{one ? 'Align to slide' : 'Align'}</div>
            {ALIGN.map(([kind, label, icon]) => (
              <Entry key={kind} label={label} icon={icon} onSelect={pick(() => controller.alignSelected(kind))} />
            ))}
            <div className="menu-sep" role="separator" />
            <Entry
              label="Distribute across"
              icon={<AlignHorizontalDistributeCenter {...ICON} />}
              disabled={selected.length < 3}
              onSelect={pick(() => controller.distributeSelected('horizontal'))}
            />
            <Entry
              label="Distribute down"
              icon={<AlignVerticalDistributeCenter {...ICON} />}
              disabled={selected.length < 3}
              onSelect={pick(() => controller.distributeSelected('vertical'))}
            />
            <div className="menu-sep" role="separator" />
            {STACK.map(([move, label, icon]) => (
              <Entry key={move} label={label} icon={icon} onSelect={pick(() => controller.restackSelected(move))} />
            ))}
          </>
        )
      }}
    </Popover>
  )
}
