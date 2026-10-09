import { barsOf, type NoteOrRest, type Question } from '@/domain/question'

export type Slot =
  { readonly kind: 'element'; readonly element: NoteOrRest } | { readonly kind: 'bar line' }

// The notes, the rests and the bar lines between bars in reading order, broken into lines of at
// most `capacity(line)` slots. A bar line never starts a line: it closes the one before.
export function staffLines(question: Question, capacity: (line: number) => number): Slot[][] {
  const slots = barsOf(question).flatMap((bar, index): Slot[] => [
    ...(index > 0 ? [{ kind: 'bar line' } as const] : []),
    ...bar.map((element) => ({ kind: 'element', element }) as const),
  ])
  const lines: Slot[][] = []
  let current: Slot[] = []
  for (const slot of slots) {
    if (slot.kind === 'element' && current.length > 0 && current.length >= capacity(lines.length)) {
      lines.push(current)
      current = []
    }
    current.push(slot)
  }
  lines.push(current)
  return lines
}
