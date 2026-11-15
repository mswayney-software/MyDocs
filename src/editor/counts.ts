import type { Node as PMNode } from '@tiptap/pm/model'

export interface Counts {
  words: number
  characters: number
  charactersNoSpaces: number
}

const cache = new WeakMap<PMNode, Counts>()

/** Word and character counts. A document is immutable, so each version is counted once. */
export function countDoc(doc: PMNode): Counts {
  let c = cache.get(doc)
  if (!c) {
    c = countText(doc.textBetween(0, doc.content.size, '\n', ' '))
    cache.set(doc, c)
  }
  return c
}

export function countRange(doc: PMNode, from: number, to: number): Counts {
  return countText(doc.textBetween(from, to, '\n', ' '))
}

/** Words as Word counts them: runs of non-space characters. */
export function countText(text: string): Counts {
  const words = text.match(/\S+/g)?.length ?? 0
  const flat = text.replace(/\n/g, '')
  return { words, characters: flat.length, charactersNoSpaces: flat.replace(/\s/g, '').length }
}
