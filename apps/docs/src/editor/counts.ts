import type { Node as PMNode } from '@tiptap/pm/model'

export interface Counts {
  words: number
  characters: number
  charactersNoSpaces: number
}

const cache = new WeakMap<PMNode, Counts>()

/**
 * Word and character counts, kept live while typing in a long paper. Nodes never change once
 * made, and an edit replaces only the blocks it touches, so each top-level block is counted
 * once and remembered: a keystroke recounts one paragraph, not 50 pages.
 */
export function countDoc(doc: PMNode): Counts {
  let total = cache.get(doc)
  if (total) return total
  total = { words: 0, characters: 0, charactersNoSpaces: 0 }
  for (let i = 0; i < doc.childCount; i++) {
    const block = doc.child(i)
    let c = cache.get(block)
    if (!c) {
      c = countText(block.textBetween(0, block.content.size, '\n', ' '))
      cache.set(block, c)
    }
    total.words += c.words
    total.characters += c.characters
    total.charactersNoSpaces += c.charactersNoSpaces
  }
  cache.set(doc, total)
  return total
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
