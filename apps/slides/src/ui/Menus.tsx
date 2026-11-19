import type { Ask } from '@mysuite/core/dialog-types'
import { MenuItem, MenuSeparator, Popover } from '@mysuite/core/ui'
import { useEditorState } from '@tiptap/react'
import type { Editor } from '@tiptap/core'
import { ChevronDown } from 'lucide-react'
import { useSyncExternalStore, type ReactNode } from 'react'
import type { AlignKind, StackMove } from '../canvas/arrange'
import type { CanvasController } from '../canvas/controller'
import { LAYOUTS } from '../deck/layouts'
import { LIMITS, type ImageElement, type SHAPES, type Transition } from '../deck/schema'
import { THEMES } from '../deck/themes'
import { editAltText } from './alt'
import { TRANSITION_NAMES } from './transitions'

/**
 * The menus beside File (spec, UI: "less-used actions live in five menus: File, Insert, Format,
 * Arrange, Slide"). Everything here is also on the toolbar or a key; the menus make each action
 * findable by name, and reachable from the keyboard in two steps.
 */

const SHAPES_MENU: [(typeof SHAPES)[number], string][] = [
  ['rect', 'Rectangle'],
  ['round-rect', 'Rounded rectangle'],
  ['ellipse', 'Oval'],
  ['triangle', 'Triangle'],
  ['line', 'Line'],
  ['arrow', 'Arrow'],
]
const ALIGN_MENU: [AlignKind, string][] = [
  ['left', 'Align left'],
  ['center', 'Align center'],
  ['right', 'Align right'],
  ['top', 'Align top'],
  ['middle', 'Align middle'],
  ['bottom', 'Align bottom'],
]
const STACK_MENU: [StackMove, string][] = [
  ['front', 'Bring to front'],
  ['forward', 'Bring forward'],
  ['backward', 'Send backward'],
  ['back', 'Send to back'],
]

function Menu({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
  return (
    <Popover
      menu
      label={label}
      className="menubar-item"
      trigger={
        <>
          {label} <ChevronDown size={14} aria-hidden="true" />
        </>
      }
    >
      {children}
    </Popover>
  )
}

const Heading = ({ children }: { children: ReactNode }) => (
  <div className="menu-heading" role="presentation">
    {children}
  </div>
)

/** Ask for a number of rows and columns, within the limits. */
async function askTableSize(ask: Ask): Promise<{ rows: number; cols: number } | null> {
  const a = await ask({
    title: 'Insert table',
    fields: [
      { key: 'rows', label: `Rows (1 to ${LIMITS.tableRows})`, value: '3', half: true },
      { key: 'cols', label: `Columns (1 to ${LIMITS.tableColumns})`, value: '3', half: true },
    ],
    buttons: [
      { label: 'Cancel', value: 'cancel' },
      { label: 'Insert table', value: 'ok', primary: true },
    ],
    cancelValue: 'cancel',
  })
  if (a.value !== 'ok') return null
  const n = (v: string | undefined, max: number) => Math.max(1, Math.min(max, Math.round(Number(v) || 1)))
  return { rows: n(a.values.rows, LIMITS.tableRows), cols: n(a.values.cols, LIMITS.tableColumns) }
}

export function InsertMenu({ controller, ask, onInsertPicture }: { controller: CanvasController; ask: Ask; onInsertPicture: () => void }) {
  return (
    <Menu label="Insert">
      {(close) => {
        const pick = (fn: () => void) => () => {
          close()
          fn()
        }
        return (
          <>
            <MenuItem label="New slide" shortcut="Mod+M" onSelect={pick(() => controller.addSlide())} />
            <MenuSeparator />
            <MenuItem label="Text box" onSelect={pick(() => controller.insertTextBox())} />
            <MenuItem label="Picture…" onSelect={pick(onInsertPicture)} />
            <MenuItem
              label="Table…"
              onSelect={pick(() =>
                void askTableSize(ask).then((size) => {
                  if (size) controller.insertTable(size.rows, size.cols)
                }),
              )}
            />
            <MenuItem label="Chart…" onSelect={pick(() => controller.openChart())} />
            <MenuSeparator />
            <Heading>Shape</Heading>
            {SHAPES_MENU.map(([kind, label]) => (
              <MenuItem key={kind} label={label} onSelect={pick(() => controller.insertShape(kind))} />
            ))}
          </>
        )
      }}
    </Menu>
  )
}

/** Text formatting while a text box or table is being typed in. */
function TextFormat({ editor, pick }: { editor: Editor; pick: (fn: () => void) => () => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({ bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'), strike: e.isActive('strike') }),
  })
  const run = () => editor.chain().focus()
  return (
    <>
      <MenuItem label="Bold" shortcut="Mod+B" checked={s.bold} onSelect={pick(() => run().toggleBold().run())} />
      <MenuItem label="Italic" shortcut="Mod+I" checked={s.italic} onSelect={pick(() => run().toggleItalic().run())} />
      <MenuItem label="Underline" shortcut="Mod+U" checked={s.underline} onSelect={pick(() => run().toggleUnderline().run())} />
      <MenuItem label="Strikethrough" shortcut="Mod+Shift+X" checked={s.strike} onSelect={pick(() => run().toggleStrike().run())} />
      <MenuItem label="Clear formatting" onSelect={pick(() => run().unsetAllMarks().run())} />
    </>
  )
}

export function FormatMenu({ controller, ask }: { controller: CanvasController; ask: Ask }) {
  const ui = useSyncExternalStore(controller.subscribe, controller.getState)
  const deck = useSyncExternalStore(controller.session.subscribe, controller.session.getState).deck
  const slide = controller.session.currentSlide()
  const selected = slide.elements.filter((e) => ui.selected.includes(e.id))
  const texts = selected.length > 0 && selected.every((e) => e.type === 'text')
  const one = selected.length === 1 ? selected[0] : undefined
  return (
    <Menu label="Format">
      {(close) => {
        const pick = (fn: () => void) => () => {
          close()
          fn()
        }
        return (
          <>
            {ui.editor ? (
              <TextFormat editor={ui.editor} pick={pick} />
            ) : (
              <>
                <Heading>Text: click into a text box first</Heading>
                {(['top', 'middle', 'bottom'] as const).map((v) => (
                  <MenuItem
                    key={v}
                    label={`Text at ${v}`}
                    radio
                    checked={texts && selected.every((e) => e.type === 'text' && e.verticalAlign === v)}
                    disabled={!texts}
                    onSelect={pick(() => controller.setVerticalAlign(v))}
                  />
                ))}
              </>
            )}
            <MenuItem
              label="Alt text…"
              disabled={one?.type !== 'image' && one?.type !== 'chart'}
              onSelect={pick(() => {
                if (one?.type === 'image') void editAltText(controller, one as ImageElement, ask)
                else if (one?.type === 'chart') controller.openChart(one.id)
              })}
            />
            <MenuSeparator />
            <Heading>Theme (every slide)</Heading>
            {THEMES.map((t) => (
              <MenuItem key={t.id} label={t.name} radio checked={deck.theme.id === t.id} onSelect={pick(() => controller.setTheme(t.id))} />
            ))}
            <MenuSeparator />
            <Heading>Layout (this slide)</Heading>
            {LAYOUTS.map((l) => (
              <MenuItem key={l.id} label={l.name} radio checked={slide.layout === l.id} onSelect={pick(() => controller.setLayout(l.id))} />
            ))}
          </>
        )
      }}
    </Menu>
  )
}

/** Exact position and size for one selected element. */
async function sizeAndPosition(controller: CanvasController, ask: Ask) {
  const slide = controller.session.currentSlide()
  const el = slide.elements.find((e) => e.id === controller.getState().selected[0])
  if (!el) return
  const a = await ask({
    title: 'Size and position',
    body: 'In slide units: the slide is 1280 wide and 720 high, measured from its top left corner.',
    fields: [
      { key: 'x', label: 'From the left', value: String(el.x), half: true },
      { key: 'y', label: 'From the top', value: String(el.y), half: true },
      { key: 'w', label: 'Width', value: String(el.w), half: true },
      { key: 'h', label: 'Height', value: String(el.h), half: true },
    ],
    buttons: [
      { label: 'Cancel', value: 'cancel' },
      { label: 'Apply', value: 'ok', primary: true },
    ],
    cancelValue: 'cancel',
  })
  if (a.value !== 'ok') return
  const num = (v: string | undefined, was: number) => (Number.isFinite(Number(v)) && v?.trim() ? Number(v) : was)
  controller.setBox(el.id, { x: num(a.values.x, el.x), y: num(a.values.y, el.y), w: num(a.values.w, el.w), h: num(a.values.h, el.h) })
}

export function ArrangeMenu({ controller, ask }: { controller: CanvasController; ask: Ask }) {
  const ui = useSyncExternalStore(controller.subscribe, controller.getState)
  const count = ui.selected.length
  return (
    <Menu label="Arrange">
      {(close) => {
        const pick = (fn: () => void) => () => {
          close()
          fn()
        }
        return (
          <>
            {STACK_MENU.map(([move, label]) => (
              <MenuItem key={move} label={label} disabled={!count} onSelect={pick(() => controller.restackSelected(move))} />
            ))}
            <MenuSeparator />
            <Heading>{count === 1 ? 'Align to slide' : 'Align'}</Heading>
            {ALIGN_MENU.map(([kind, label]) => (
              <MenuItem key={kind} label={label} disabled={!count} onSelect={pick(() => controller.alignSelected(kind))} />
            ))}
            <MenuItem label="Distribute across" disabled={count < 3} onSelect={pick(() => controller.distributeSelected('horizontal'))} />
            <MenuItem label="Distribute down" disabled={count < 3} onSelect={pick(() => controller.distributeSelected('vertical'))} />
            <MenuSeparator />
            <MenuItem label="Size and position…" disabled={count !== 1} onSelect={pick(() => void sizeAndPosition(controller, ask))} />
            <MenuItem label="Make bigger" shortcut="Mod+Shift+ArrowRight" disabled={!count} onSelect={pick(() => controller.resizeBy(10, 10))} />
            <MenuItem label="Make smaller" shortcut="Mod+Shift+ArrowLeft" disabled={!count} onSelect={pick(() => controller.resizeBy(-10, -10))} />
          </>
        )
      }}
    </Menu>
  )
}

export function SlideMenu({ controller, onSorter, onPresentHere }: { controller: CanvasController; onSorter: () => void; onPresentHere: () => void }) {
  const ui = useSyncExternalStore(controller.subscribe, controller.getState)
  const deck = useSyncExternalStore(controller.session.subscribe, controller.session.getState).deck
  const slide = controller.session.currentSlide()
  const index = deck.slides.indexOf(slide)
  const picked = ui.slides.length
  const which = picked > 1 ? `${picked} slides` : 'slide'
  return (
    <Menu label="Slide">
      {(close) => {
        const pick = (fn: () => void) => () => {
          close()
          fn()
        }
        return (
          <>
            <MenuItem label="New slide" shortcut="Mod+M" onSelect={pick(() => controller.addSlide())} />
            <MenuItem label={`Duplicate ${which}`} onSelect={pick(() => controller.duplicateSlides())} />
            <MenuItem label={`Delete ${which}`} disabled={picked >= deck.slides.length} onSelect={pick(() => controller.deleteSlides())} />
            <MenuItem label="Move earlier" disabled={index <= 0 && picked === 1} onSelect={pick(() => controller.moveSlidesBy(-1))} />
            <MenuItem label="Move later" disabled={index >= deck.slides.length - 1 && picked === 1} onSelect={pick(() => controller.moveSlidesBy(1))} />
            <MenuSeparator />
            <Heading>Transition</Heading>
            {(Object.keys(TRANSITION_NAMES) as Transition[]).map((t) => (
              <MenuItem key={t} label={TRANSITION_NAMES[t]} radio checked={slide.transition === t} onSelect={pick(() => controller.setTransition(t))} />
            ))}
            <MenuItem label={`Use “${TRANSITION_NAMES[slide.transition]}” on every slide`} onSelect={pick(() => controller.setTransition(slide.transition, true))} />
            <MenuSeparator />
            <MenuItem label="Slide sorter" onSelect={pick(onSorter)} />
            <MenuItem label="Present from this slide" shortcut="Shift+F5" onSelect={pick(onPresentHere)} />
          </>
        )
      }}
    </Menu>
  )
}
