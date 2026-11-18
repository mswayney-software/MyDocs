import Image from '@tiptap/extension-image'

export type ImageAlign = 'left' | 'center' | 'right'

/** Only images embedded in the document. A web address would make the app fetch it, and could track who opens a file. */
export const isEmbeddedImage = (src: unknown): src is string =>
  typeof src === 'string' && /^data:image\/(png|jpe?g|gif|webp|bmp|svg\+xml);base64,/i.test(src)

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    imageAlign: {
      setImageAlign: (align: ImageAlign) => ReturnType
    }
  }
}

/**
 * Block image, stored inside the document as a data URL, resizable from its corners,
 * aligned left, center or right.
 */
export const DocImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: 'center' as ImageAlign,
        parseHTML: (el: HTMLElement) => {
          const a = el.getAttribute('data-align')
          return a === 'left' || a === 'right' ? a : 'center'
        },
        renderHTML: (attrs: { align: ImageAlign }) => ({ 'data-align': attrs.align }),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'img[src]',
        // Pasted images from websites are dropped rather than linked; see isEmbeddedImage.
        getAttrs: (el) => (isEmbeddedImage((el as HTMLElement).getAttribute('src')) ? null : false),
      },
    ]
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setImageAlign:
        (align) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { align }),
    }
  },
}).configure({
  inline: false,
  allowBase64: true,
  resize: {
    enabled: true,
    directions: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
    minWidth: 40,
    minHeight: 40,
    alwaysPreserveAspectRatio: true,
  },
})
