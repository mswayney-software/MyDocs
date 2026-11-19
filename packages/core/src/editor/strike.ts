import Strike from '@tiptap/extension-strike'

/**
 * Strikethrough on Ctrl+Shift+X (Cmd+Shift+X on a Mac), as in Google Docs.
 * Tiptap's default, Ctrl+Shift+S, is Save as in both apps: one press used to strike the
 * selected text and open Save as. Use with StarterKit's own strike turned off.
 */
export const StrikeX = Strike.extend({
  addKeyboardShortcuts() {
    return { 'Mod-Shift-x': () => this.editor.commands.toggleStrike() }
  },
})
