import type { Editor } from '@tiptap/react'
import { Check, ChevronDown } from 'lucide-react'
import { clearFormatting } from '../editor'
import { Popover } from './Popover'
import { shortcutLabel, tooltip } from './shortcuts'
import { useFormatState } from './useFormatState'

interface ItemProps {
  label: string
  shortcut?: string
  checked?: boolean
  onSelect: () => void
}

function Item({ label, shortcut, checked, onSelect }: ItemProps) {
  return (
    <button
      type="button"
      className="menu-item"
      role={checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
      aria-checked={checked}
      title={tooltip(label, shortcut)}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
    >
      <span className="menu-check" aria-hidden="true">{checked && <Check size={14} />}</span>
      <span className="menu-label">{label}</span>
      {shortcut && <span className="menu-shortcut">{shortcutLabel(shortcut)}</span>}
    </button>
  )
}

const SPACE_PT = 12

/** Less-used formatting, reachable in two clicks: open the menu, pick the item. */
export function FormatMenu({ editor }: { editor: Editor }) {
  const s = useFormatState(editor)
  const run = () => editor.chain().focus()

  return (
    <Popover
      menu
      label="Format"
      className="menubar-item"
      trigger={
        <>
          Format <ChevronDown size={14} aria-hidden="true" />
        </>
      }
    >
      {(close) => {
        const pick = (fn: () => void) => () => {
          fn()
          close()
        }
        return (
          <>
            <Item
              label="Space before paragraph"
              checked={s.spaceBefore > 0}
              onSelect={pick(() => run().setSpaceBefore(s.spaceBefore > 0 ? null : SPACE_PT).run())}
            />
            <Item
              label="Space after paragraph"
              checked={s.spaceAfter > 0}
              onSelect={pick(() => run().setSpaceAfter(s.spaceAfter > 0 ? null : SPACE_PT).run())}
            />
            <div className="menu-sep" role="separator" />
            <Item
              label="First-line indent"
              shortcut="Tab"
              checked={s.firstLine > 0}
              onSelect={pick(() => run().toggleFirstLineIndent().run())}
            />
            <Item
              label="Hanging indent"
              checked={s.firstLine < 0}
              onSelect={pick(() => run().toggleHangingIndent().run())}
            />
            <Item
              label="Block quote"
              shortcut="Mod+Shift+B"
              checked={s.blockquote}
              onSelect={pick(() => run().toggleBlockquote().run())}
            />
            <div className="menu-sep" role="separator" />
            <Item label="Clear formatting" shortcut="Mod+Space" onSelect={pick(() => clearFormatting(editor))} />
          </>
        )
      }}
    </Popover>
  )
}
