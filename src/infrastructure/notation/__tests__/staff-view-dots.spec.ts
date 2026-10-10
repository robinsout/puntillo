import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { StaffView } from '@/infrastructure/notation'
import type { StaffLayout } from '@/infrastructure/notation'
import type { Letter } from '@/domain/pitch'
import {
  createQuestionOf,
  type Duration,
  type Note,
  type NoteOrRest,
  type Rest,
  type TimeSignature,
} from '@/domain/question'

// Feature multi-note-questions, slice 5: dotted notes and rests on the staff (criterion 7). A
// dotted element is drawn with one augmentation dot right of its head; a plain one has none. A
// dot takes no place of its own: the layout reports the notes and the rests as before.
//
// VexFlow draws the dot as the SMuFL glyph augmentationDot inside the group of the head it
// follows. jsdom has no layout, so glyphs have no width: a dot's x is just right of its head's x.

const DOT = ''
const HEAD = { half: '', black: '' }
const REST = { half: '', quarter: '', eighth: '' }

const FOUR_FOUR: TimeSignature = { beats: 4, beatValue: 4 }
const THREE_FOUR: TimeSignature = { beats: 3, beatValue: 4 }

const dotted = (value: Duration['value']): Duration => ({ value, dots: 1 })
const plain = (value: Duration['value']): Duration => ({ value })
const note = (letter: Letter, duration: Duration, octave = 4): Note => ({
  pitch: { letter, octave },
  duration,
})
const rest = (duration: Duration): Rest => ({ duration })

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
})

function widthOfElements(width: number) {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width)
}

const all = (root: Element, selector: string) => [...root.querySelectorAll(selector)]

function reported(view: VueWrapper): StaffLayout {
  const [layout] = (view.emitted('drawn')?.at(-1) ?? []) as [StaffLayout?]
  if (!layout) throw new Error('nothing drawn')
  return layout
}

interface Glyph {
  glyph: string
  x: number
  y: number
}

const glyphOf = (text: Element): Glyph => ({
  glyph: text.textContent ?? '',
  x: Number(text.getAttribute('x')),
  y: Number(text.getAttribute('y')),
})

async function drawn(timeSignature: TimeSignature, ...elements: NoteOrRest[]) {
  const question = createQuestionOf(timeSignature, elements)
  wrapper = mount(StaffView, { props: { question, label: 'Music staff' }, attachTo: document.body })
  const view = wrapper
  await vi.waitFor(() => expect(view.emitted('drawn')).toBeDefined())
  // Each stave note in its order: its head and the dots drawn after it.
  const staveNotes = all(view.element, '.vf-stavenote').map((group) => {
    const glyphs = all(group, 'text').map(glyphOf)
    return {
      head: glyphs.find((each) => each.glyph !== DOT),
      dots: glyphs.filter((each) => each.glyph === DOT),
    }
  })
  return { root: view.element, layout: reported(view), staveNotes }
}

describe('StaffView with dots', () => {
  it('draws one dot after a dotted note and none after a plain one', async () => {
    const { staveNotes } = await drawn(
      FOUR_FOUR,
      note('C', dotted('half')),
      note('E', plain('quarter')),
    )

    expect(staveNotes.map((each) => each.head?.glyph)).toEqual([HEAD.half, HEAD.black])
    expect(staveNotes.map((each) => each.dots.length)).toEqual([1, 0])
  })

  it('draws the dot right of its head', async () => {
    widthOfElements(1000)
    const { staveNotes } = await drawn(
      FOUR_FOUR,
      note('B', dotted('quarter')),
      note('A', dotted('quarter')),
      note('G', plain('quarter')),
    )

    for (const { head, dots } of staveNotes.slice(0, 2)) {
      const [dot] = dots
      expect(dot?.x).toBeGreaterThan(head?.x ?? Infinity)
      expect(Math.abs((dot?.y ?? NaN) - (head?.y ?? NaN))).toBeLessThanOrEqual(5)
    }
  })

  it.each(['half', 'quarter', 'eighth'] as const)(
    'draws a dotted %s rest with its glyph and one dot',
    async (value) => {
      const { staveNotes } = await drawn(THREE_FOUR, rest(dotted(value)), note('C', plain(value)))

      expect(staveNotes[0]?.head?.glyph).toBe(REST[value])
      expect(staveNotes[0]?.dots).toHaveLength(1)
      expect(staveNotes[1]?.dots).toHaveLength(0)
    },
  )

  it('draws a dot after each dotted element of two full bars', async () => {
    const { root, staveNotes } = await drawn(
      THREE_FOUR,
      note('C', dotted('half')),
      note('D', dotted('quarter')),
      note('E', dotted('quarter')),
    )

    expect(staveNotes.map((each) => each.dots.length)).toEqual([1, 1, 1])
    expect(all(root, 'text').filter((text) => text.textContent === DOT)).toHaveLength(3)
  })

  it('reports the places of the notes and the rests as before: a dot takes no place', async () => {
    widthOfElements(1000)
    const { layout, staveNotes } = await drawn(
      FOUR_FOUR,
      note('C', dotted('quarter')),
      note('D', plain('eighth')),
      rest(plain('quarter')),
      note('E', plain('quarter')),
    )

    expect(layout.notes).toHaveLength(3)
    expect(layout.rests).toHaveLength(1)
    const heads = staveNotes.map((each) => each.head?.x ?? NaN)
    expect(Math.abs((layout.notes[0]?.x ?? NaN) * 1000 - (heads[0] ?? NaN))).toBeLessThanOrEqual(1)
    expect(Math.abs((layout.rests[0]?.x ?? NaN) * 1000 - (heads[2] ?? NaN))).toBeLessThanOrEqual(1)
  })
})

describe('StaffView with dots on a narrow element', () => {
  // Criterion 8: a dot does not narrow the target of the note after it.
  it('keeps each note at least 44 px from the next note on its line', async () => {
    widthOfElements(328)
    const elements = Array.from({ length: 8 }, (_, index) =>
      index % 2 === 0
        ? note(index % 4 === 0 ? 'C' : 'E', dotted('eighth'))
        : note(index % 4 === 1 ? 'D' : 'F', plain('sixteenth')),
    )
    const { layout } = await drawn({ beats: 2, beatValue: 4 }, ...elements)

    layout.notes.slice(1).forEach((place, index) => {
      const before = layout.notes[index]
      if (!before || before.line !== place.line) return
      expect(
        (place.x - before.x) * 328,
        `notes ${index + 1} and ${index + 2}`,
      ).toBeGreaterThanOrEqual(44)
    })
  })
})
