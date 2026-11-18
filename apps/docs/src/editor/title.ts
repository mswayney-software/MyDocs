import { Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    title: {
      /** Turn the current block into the document title. */
      setTitle: () => ReturnType
    }
  }
}

/** A "Title" paragraph style, separate from headings 1 to 3. */
export const Title = Node.create({
  name: 'title',
  group: 'block',
  content: 'inline*',
  defining: true,

  parseHTML() {
    return [{ tag: 'p[data-type="title"]', priority: 100 }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['p', mergeAttributes({ 'data-type': 'title', class: 'doc-title' }, HTMLAttributes), 0]
  },

  addCommands() {
    return {
      setTitle:
        () =>
        ({ commands }) =>
          commands.setNode(this.name),
    }
  },
})
