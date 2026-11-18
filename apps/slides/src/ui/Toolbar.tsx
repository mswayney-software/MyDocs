import { HIGHLIGHT_COLORS, TEXT_COLORS } from '@mysuite/core/fonts'
import type { Ask } from '@mysuite/core/dialog-types'
import { ariaShortcut, tooltip } from '@mysuite/core/shortcuts'
import { SwatchPicker } from '@mysuite/core/ui'
import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import {
  AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, Baseline, Bold, Highlighter, Italic, Link,
  List, ListIndentDecrease, ListIndentIncrease, ListOrdered, Redo2, SquarePlus, Strikethrough, TextAlignCenter, TextAlignEnd,
  ImagePlus, TextAlignJustify, TextAlignStart, Trash2, Type, Underline, Undo2,
} from 'lucide-react'
import { useSyncExternalStore, type ReactNode } from 'react'
import { editAltText } from './alt'
import { DesignPickers } from './DesignPickers'
import { ArrangeMenu, ShapeMenu, ShapeStyle } from './ObjectTools'
import { editLinkDialog } from './link'
import type { CanvasController } from '../canvas/controller'
import type { ImageElement, ShapeElement, Theme } from '../deck/schema'
import { textDefaults } from '../slide/style'
import { FONT_SIZES, LINE_SPACINGS } from '../text/extensions'
import { SLIDE_FONTS } from '../text/fonts'

const ICON = { size: 18, strokeWidth: 2, 'aria-hidden': true } as const

function Btn({ label, shortcut, active, disabled, onClick, children }: {
  label: string
  shortcut?: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="tb-btn"
      aria-label={label}
      title={tooltip(label, shortcut)}
      aria-keyshortcuts={shortcut ? ariaShortcut(shortcut) : undefined}
      aria-pressed={active}
      disabled={disabled}
      // Keep the editor's selection when clicking a button.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

const Sep = () => <span className="tb-sep" aria-hidden="true" />

/**
 * The one toolbar row. It always offers undo and inserting; it then shows the tools for what is
 * in hand: text formatting while typing, box settings when an element is selected.
 */
export function Toolbar({ controller, ask, theme, onInsertPicture }: {
  controller: CanvasController
  ask: Ask
  theme: Theme
  /** Pick a picture file and add it (the app reports a file that isn't a picture). */
  onInsertPicture: () => void
}) {
  const ui = useSyncExternalStore(controller.subscribe, controller.getState)
  const deck = useSyncExternalStore(controller.session.subscribe, controller.session.getState)
  const slide = controller.session.currentSlide()
  const selected = slide.elements.filter((e) => ui.selected.includes(e.id))
  const editingEl = slide.elements.find((e) => e.id === ui.editingId)

  return (
    <div className="toolbar" role="toolbar" aria-label="Slide tools">
      <span className="tb-group">
        {ui.editor ? (
          <EditorUndo editor={ui.editor} />
        ) : (
          <>
            <Btn label="Undo" shortcut="Mod+Z" disabled={!deck.canUndo} onClick={() => controller.undo()}>
              <Undo2 {...ICON} />
            </Btn>
            <Btn label="Redo" shortcut="Mod+Y" disabled={!deck.canRedo} onClick={() => controller.redo()}>
              <Redo2 {...ICON} />
            </Btn>
          </>
        )}
      </span>
      <Sep />
      <span className="tb-group">
        <Btn label="New slide" shortcut="Mod+M" onClick={() => controller.addSlide()}>
          <SquarePlus {...ICON} />
        </Btn>
        <Btn label="Text box" onClick={() => controller.insertTextBox()}>
          <Type {...ICON} />
        </Btn>
        <Btn label="Picture" onClick={onInsertPicture}>
          <ImagePlus {...ICON} />
        </Btn>
        <ShapeMenu controller={controller} />
      </span>
      {ui.editor && editingEl?.type === 'text' ? (
        <TextTools editor={ui.editor} ask={ask} defaults={textDefaults(editingEl.role, theme)} />
      ) : selected.length > 0 ? (
        <>
          <Sep />
          {selected.every((e) => e.type === 'text') && (
            <span className="tb-group" role="group" aria-label="Text position in the box">
              {(
                [
                  ['top', 'Text at top', <AlignVerticalJustifyStart key="t" {...ICON} />],
                  ['middle', 'Text in middle', <AlignVerticalJustifyCenter key="m" {...ICON} />],
                  ['bottom', 'Text at bottom', <AlignVerticalJustifyEnd key="b" {...ICON} />],
                ] as const
              ).map(([v, label, icon]) => (
                <Btn
                  key={v}
                  label={label}
                  active={selected.every((e) => e.type === 'text' && e.verticalAlign === v)}
                  onClick={() => controller.setVerticalAlign(v)}
                >
                  {icon}
                </Btn>
              ))}
            </span>
          )}
          {selected.every((e) => e.type === 'shape') && (
            <ShapeStyle controller={controller} shapes={selected as ShapeElement[]} theme={theme} />
          )}
          {selected.length === 1 && selected[0].type === 'image' && (
            <span className="tb-group">
              <button
                type="button"
                className="tb-btn tb-text-btn"
                title="Alt text: describe the picture for screen readers"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void editAltText(controller, selected[0] as ImageElement, ask)}
              >
                Alt text
              </button>
            </span>
          )}
          <span className="tb-group">
            <ArrangeMenu controller={controller} selected={selected} />
            <Btn label="Delete" shortcut="Delete" onClick={() => controller.deleteSelected()}>
              <Trash2 {...ICON} />
            </Btn>
          </span>
        </>
      ) : (
        <>
          <Sep />
          <span className="tb-group" role="group" aria-label="Slide design">
            <DesignPickers controller={controller} slide={slide} theme={theme} />
          </span>
        </>
      )}
    </div>
  )
}

function EditorUndo({ editor }: { editor: Editor }) {
  const s = useEditorState({ editor, selector: ({ editor: e }) => ({ undo: e.can().undo(), redo: e.can().redo() }) })
  return (
    <>
      <Btn label="Undo" shortcut="Mod+Z" disabled={!s.undo} onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 {...ICON} />
      </Btn>
      <Btn label="Redo" shortcut="Mod+Y" disabled={!s.redo} onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 {...ICON} />
      </Btn>
    </>
  )
}

const parsePt = (v: unknown) => {
  const n = parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : null
}

function TextTools({ editor, ask, defaults }: { editor: Editor; ask: Ask; defaults: ReturnType<typeof textDefaults> }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const ts = e.getAttributes('textStyle')
      return {
        font: (ts.fontFamily as string | undefined) ?? defaults.font,
        size: parsePt(ts.fontSize) ?? defaults.size,
        color: (ts.color as string | undefined) ?? null,
        highlight: e.isActive('highlight') ? ((e.getAttributes('highlight').color as string | undefined) ?? '#ffff00') : null,
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        underline: e.isActive('underline'),
        strike: e.isActive('strike'),
        align: (['center', 'right', 'justify'] as const).find((a) => e.isActive({ textAlign: a })) ?? 'left',
        lineHeight: (e.state.selection.$from.parent.attrs.lineHeight as number | null) ?? null,
        bullets: e.isActive('bulletList'),
        numbers: e.isActive('orderedList'),
        inList: e.isActive('listItem'),
        link: e.isActive('link'),
      }
    },
  })
  const run = () => editor.chain().focus()
  const fonts = SLIDE_FONTS.some((f) => f.name === s.font) ? SLIDE_FONTS : [...SLIDE_FONTS, { name: s.font, label: s.font }]
  const sizes = (FONT_SIZES as readonly number[]).includes(s.size) ? FONT_SIZES : [...FONT_SIZES, s.size].sort((a, b) => a - b)

  const editLink = () => editLinkDialog(editor, ask)

  return (
    <>
      <Sep />
      <span className="tb-group">
        <select className="tb-select tb-font" aria-label="Font" value={s.font} onChange={(e) => run().setFontFamily(e.target.value).run()}>
          {fonts.map((f) => (
            <option key={f.name} value={f.name}>{f.label}</option>
          ))}
        </select>
        <select className="tb-select tb-size" aria-label="Font size" value={s.size} onChange={(e) => run().setFontSize(`${e.target.value}pt`).run()}>
          {sizes.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </span>
      <Sep />
      <span className="tb-group">
        <Btn label="Bold" shortcut="Mod+B" active={s.bold} onClick={() => run().toggleBold().run()}><Bold {...ICON} /></Btn>
        <Btn label="Italic" shortcut="Mod+I" active={s.italic} onClick={() => run().toggleItalic().run()}><Italic {...ICON} /></Btn>
        <Btn label="Underline" shortcut="Mod+U" active={s.underline} onClick={() => run().toggleUnderline().run()}><Underline {...ICON} /></Btn>
        <Btn label="Strikethrough" shortcut="Mod+Shift+X" active={s.strike} onClick={() => run().toggleStrike().run()}><Strikethrough {...ICON} /></Btn>
        <SwatchPicker
          label="Text color"
          title="Text color"
          icon={<Baseline {...ICON} />}
          current={s.color}
          colors={TEXT_COLORS}
          noneLabel="Automatic"
          onPick={(v) => (v ? run().setColor(v).run() : run().unsetColor().run())}
          onClosed={() => editor.commands.focus()}
        />
        <SwatchPicker
          label="Highlight"
          title="Highlight"
          icon={<Highlighter {...ICON} />}
          current={s.highlight}
          colors={HIGHLIGHT_COLORS}
          noneLabel="No highlight"
          onPick={(v) => (v ? run().setHighlight({ color: v }).run() : run().unsetHighlight().run())}
          onClosed={() => editor.commands.focus()}
        />
      </span>
      <Sep />
      <span className="tb-group">
        {(
          [
            ['left', 'Align left', 'Mod+Shift+L', <TextAlignStart key="l" {...ICON} />],
            ['center', 'Center', 'Mod+Shift+E', <TextAlignCenter key="c" {...ICON} />],
            ['right', 'Align right', 'Mod+Shift+R', <TextAlignEnd key="r" {...ICON} />],
            ['justify', 'Justify', 'Mod+Shift+J', <TextAlignJustify key="j" {...ICON} />],
          ] as const
        ).map(([v, label, sc, icon]) => (
          <Btn key={v} label={label} shortcut={sc} active={s.align === v} onClick={() => run().setTextAlign(v).run()}>
            {icon}
          </Btn>
        ))}
        <select
          className="tb-select tb-spacing"
          aria-label="Line spacing"
          value={s.lineHeight ?? ''}
          onChange={(e) => run().setParagraphLineHeight(e.target.value ? Number(e.target.value) : null).run()}
        >
          <option value="">Auto</option>
          {LINE_SPACINGS.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </span>
      <Sep />
      <span className="tb-group">
        <Btn label="Bulleted list" shortcut="Mod+Shift+8" active={s.bullets} onClick={() => run().toggleBulletList().run()}><List {...ICON} /></Btn>
        <Btn label="Numbered list" shortcut="Mod+Shift+7" active={s.numbers} onClick={() => run().toggleOrderedList().run()}><ListOrdered {...ICON} /></Btn>
        <Btn label="Decrease indent" shortcut="Shift+Tab" disabled={!s.inList} onClick={() => run().liftListItem('listItem').run()}><ListIndentDecrease {...ICON} /></Btn>
        <Btn label="Increase indent" shortcut="Tab" disabled={!s.inList} onClick={() => run().sinkListItem('listItem').run()}><ListIndentIncrease {...ICON} /></Btn>
        <Btn label="Link" shortcut="Mod+K" active={s.link} onClick={() => void editLink()}><Link {...ICON} /></Btn>
      </span>
    </>
  )
}
