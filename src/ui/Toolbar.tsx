import type { Editor } from '@tiptap/react'
import {
  Baseline, Bold, Highlighter, Italic, List, ListIndentDecrease, ListIndentIncrease, ListOrdered, Redo2,
  RemoveFormatting, Strikethrough, Subscript, Superscript, TextAlignCenter, TextAlignEnd, TextAlignJustify,
  TextAlignStart, Underline, Undo2,
} from 'lucide-react'
import type { ReactNode } from 'react'
import {
  clearFormatting, DEFAULT_FONT, DEFAULT_LINE_SPACING, FONT_SIZES, FONTS, HIGHLIGHT_COLORS, LINE_SPACINGS,
  TEXT_COLORS,
} from '../editor'
import { setBlockStyle } from './blockStyle'
import { tooltip } from './shortcuts'
import { SwatchPicker } from './SwatchPicker'
import { BLOCK_FONT_SIZE, useFormatState, type Align, type BlockStyle } from './useFormatState'

const ICON = { size: 18, strokeWidth: 2, 'aria-hidden': true } as const

interface BtnProps {
  label: string
  shortcut?: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}

function Btn({ label, shortcut, active, disabled, onClick, children }: BtnProps) {
  return (
    <button
      type="button"
      className="tb-btn"
      aria-label={label}
      title={tooltip(label, shortcut)}
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

const BLOCK_STYLES: { value: BlockStyle; label: string }[] = [
  { value: 'paragraph', label: 'Normal text' },
  { value: 'title', label: 'Title' },
  { value: 'h1', label: 'Heading 1' },
  { value: 'h2', label: 'Heading 2' },
  { value: 'h3', label: 'Heading 3' },
]

const ALIGNS: { value: Align; label: string; shortcut: string; icon: ReactNode }[] = [
  { value: 'left', label: 'Align left', shortcut: 'Mod+Shift+L', icon: <TextAlignStart {...ICON} /> },
  { value: 'center', label: 'Center', shortcut: 'Mod+Shift+E', icon: <TextAlignCenter {...ICON} /> },
  { value: 'right', label: 'Align right', shortcut: 'Mod+Shift+R', icon: <TextAlignEnd {...ICON} /> },
  { value: 'justify', label: 'Justify', shortcut: 'Mod+Shift+J', icon: <TextAlignJustify {...ICON} /> },
]

export function Toolbar({ editor }: { editor: Editor }) {
  const s = useFormatState(editor)
  const run = () => editor.chain().focus()

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <Btn label="Undo" shortcut="Mod+Z" disabled={!s.canUndo} onClick={() => run().undo().run()}>
        <Undo2 {...ICON} />
      </Btn>
      <Btn label="Redo" shortcut="Mod+Y" disabled={!s.canRedo} onClick={() => run().redo().run()}>
        <Redo2 {...ICON} />
      </Btn>
      <Sep />

      <select
        className="tb-select tb-style"
        aria-label="Paragraph style"
        title={tooltip('Paragraph style', 'Mod+Alt+0 to 3')}
        value={s.block}
        onChange={(e) => setBlockStyle(editor, e.target.value as BlockStyle)}
      >
        {BLOCK_STYLES.map((b) => (
          <option key={b.value} value={b.value}>
            {b.label}
          </option>
        ))}
      </select>
      <select
        className="tb-select tb-font"
        aria-label="Font"
        title="Font"
        value={s.fontFamily}
        style={{ fontFamily: s.fontFamily }}
        onChange={(e) =>
          e.target.value === DEFAULT_FONT
            ? run().unsetFontFamily().run()
            : run().setFontFamily(e.target.value).run()
        }
      >
        {FONTS.map((f) => (
          <option key={f} value={f} style={{ fontFamily: f }}>
            {f}
          </option>
        ))}
      </select>
      <select
        className="tb-select tb-size"
        aria-label="Font size"
        title="Font size"
        value={String(s.fontSize)}
        onChange={(e) => {
          const pt = Number(e.target.value)
          return pt === BLOCK_FONT_SIZE[s.block] ? run().unsetFontSize().run() : run().setFontSize(`${pt}pt`).run()
        }}
      >
        {/* Keep an unusual size (from an imported file) selectable. */}
        {[...new Set([...FONT_SIZES, s.fontSize])].sort((a, b) => a - b).map((pt) => (
          <option key={pt} value={String(pt)}>
            {pt}
          </option>
        ))}
      </select>
      <Sep />

      <Btn label="Bold" shortcut="Mod+B" active={s.bold} onClick={() => run().toggleBold().run()}>
        <Bold {...ICON} />
      </Btn>
      <Btn label="Italic" shortcut="Mod+I" active={s.italic} onClick={() => run().toggleItalic().run()}>
        <Italic {...ICON} />
      </Btn>
      <Btn label="Underline" shortcut="Mod+U" active={s.underline} onClick={() => run().toggleUnderline().run()}>
        <Underline {...ICON} />
      </Btn>
      <Btn label="Strikethrough" shortcut="Mod+Shift+S" active={s.strike} onClick={() => run().toggleStrike().run()}>
        <Strikethrough {...ICON} />
      </Btn>
      <Btn
        label="Superscript"
        shortcut="Mod+."
        active={s.superscript}
        onClick={() => run().unsetSubscript().toggleSuperscript().run()}
      >
        <Superscript {...ICON} />
      </Btn>
      <Btn
        label="Subscript"
        shortcut="Mod+,"
        active={s.subscript}
        onClick={() => run().unsetSuperscript().toggleSubscript().run()}
      >
        <Subscript {...ICON} />
      </Btn>
      <SwatchPicker
        label="Text color"
        title="Text color"
        icon={<Baseline {...ICON} />}
        current={s.color}
        colors={TEXT_COLORS}
        noneLabel="Automatic"
        onPick={(c) => (c ? run().setColor(c).run() : run().unsetColor().run())}
      />
      <SwatchPicker
        label="Highlight"
        title={tooltip('Highlight', 'Mod+Shift+H')}
        icon={<Highlighter {...ICON} />}
        current={s.highlight}
        colors={HIGHLIGHT_COLORS}
        noneLabel="No highlight"
        onPick={(c) => (c ? run().setHighlight({ color: c }).run() : run().unsetHighlight().run())}
      />
      <Btn label="Clear formatting" shortcut="Mod+Space" onClick={() => clearFormatting(editor)}>
        <RemoveFormatting {...ICON} />
      </Btn>
      <Sep />

      {ALIGNS.map((a) => (
        <Btn
          key={a.value}
          label={a.label}
          shortcut={a.shortcut}
          active={s.align === a.value}
          onClick={() => run().setTextAlign(a.value).run()}
        >
          {a.icon}
        </Btn>
      ))}
      <select
        className="tb-select tb-spacing"
        aria-label="Line spacing"
        title="Line spacing"
        value={String(s.lineHeight)}
        onChange={(e) => {
          const v = Number(e.target.value)
          return run().setParagraphSpacing(v === DEFAULT_LINE_SPACING ? null : v).run()
        }}
      >
        {[...new Set([...LINE_SPACINGS, s.lineHeight])].sort((a, b) => a - b).map((v) => (
          <option key={v} value={String(v)}>
            {v} spacing
          </option>
        ))}
      </select>
      <Sep />

      <Btn label="Bulleted list" shortcut="Mod+Shift+8" active={s.bulletList} onClick={() => run().toggleBulletList().run()}>
        <List {...ICON} />
      </Btn>
      <Btn label="Numbered list" shortcut="Mod+Shift+7" active={s.orderedList} onClick={() => run().toggleOrderedList().run()}>
        <ListOrdered {...ICON} />
      </Btn>
      <Btn
        label="Decrease indent"
        shortcut={s.inList ? 'Shift+Tab' : undefined}
        onClick={() => (s.inList ? run().liftListItem('listItem').run() : run().changeIndent(-1).run())}
      >
        <ListIndentDecrease {...ICON} />
      </Btn>
      <Btn
        label="Increase indent"
        shortcut={s.inList ? 'Tab' : undefined}
        onClick={() => (s.inList ? run().sinkListItem('listItem').run() : run().changeIndent(1).run())}
      >
        <ListIndentIncrease {...ICON} />
      </Btn>
    </div>
  )
}
