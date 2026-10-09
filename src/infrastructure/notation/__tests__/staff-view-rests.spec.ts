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
  type Question,
  type Rest,
  type TimeSignature,
} from '@/domain/question'

// Feature multi-note-questions, slice 4: rests on the staff (criterion 6). A rest is drawn with
// the SMuFL glyph of its duration at its usual place: the whole rest hangs from the 4th line, the
// others stand on the middle one. It has no stem and no flag, and it takes a place on the line as
// a note does. It needs no answer, so the layout reports the places of the notes alone: the k-th
// place is that of the k-th note, whatever rests stand before it.
//
// VexFlow draws a rest as a stave note whose head is the rest glyph. jsdom has no layout, so the
// width of the element is stubbed; glyphs have no width in jsdom, so a head's x is its centre.

const REST = {
  whole: '',
  half: '',
  quarter: '',
  eighth: '',
  sixteenth: '',
} as const satisfies Record<Duration['value'], string>
const HEAD = { whole: '', half: '', black: '' }
const RESTS: readonly string[] = Object.values(REST)

const FOUR_FOUR: TimeSignature = { beats: 4, beatValue: 4 }

const note = (letter: Letter, value: Duration['value']): Note => ({
  pitch: { letter, octave: 4 },
  duration: { value },
})
const rest = (value: Duration['value']): Rest => ({ duration: { value } })

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

// The five lines of the first stave, top to bottom. A line is drawn half a pixel off to stay crisp.
function staffLineYs(root: Element): number[] {
  const stave = root.querySelector('.vf-stave')
  return all(stave ?? root, 'path')
    .map((path) => /^M\s*[\d.-]+[\s,]+([\d.-]+)/.exec(path.getAttribute('d') ?? '')?.[1])
    .filter((y): y is string => y !== undefined)
    .map(Number)
    .sort((a, b) => a - b)
    .slice(0, 5)
}

async function drawn(...elements: NoteOrRest[]) {
  return drawnQuestion(createQuestionOf(FOUR_FOUR, elements))
}

async function drawnQuestion(question: Question) {
  wrapper = mount(StaffView, { props: { question, label: 'Music staff' }, attachTo: document.body })
  const view = wrapper
  await vi.waitFor(() => expect(view.emitted('drawn')).toBeDefined())
  const svg = view.element.querySelector('svg')
  const [, , width = 0, height = 0] = (svg?.getAttribute('viewBox') ?? '')
    .split(/[\s,]+/)
    .map(Number)
  // The heads of the stave notes in their order: noteheads and rest glyphs alike.
  const heads = all(view.element, '.vf-stavenote .vf-notehead text').map((head) => ({
    glyph: head.textContent ?? '',
    x: Number(head.getAttribute('x')),
    y: Number(head.getAttribute('y')),
  }))
  return { root: view.element, layout: reported(view), heads, width, height }
}

describe('StaffView with rests', () => {
  it('draws a rest among the notes, in its place', async () => {
    const { root, heads } = await drawn(note('C', 'quarter'), rest('quarter'), note('D', 'half'))

    expect(all(root, '.vf-stavenote')).toHaveLength(3)
    expect(heads.map((head) => head.glyph)).toEqual([HEAD.black, REST.quarter, HEAD.half])
  })

  it.each(Object.entries(REST))('draws the %s rest with its glyph', async (value, glyph) => {
    const duration = value as Duration['value']
    const { heads } = await drawn(rest(duration), note('C', duration))

    expect(heads[0]?.glyph).toBe(glyph)
  })

  it('hangs the whole rest from the 4th line', async () => {
    const { root, heads } = await drawn(rest('whole'), note('C', 'whole'))
    const [, fourthLine] = staffLineYs(root)

    expect(Math.abs((heads[0]?.y ?? NaN) - (fourthLine ?? NaN))).toBeLessThanOrEqual(1)
  })

  it.each(['half', 'quarter', 'eighth', 'sixteenth'] as const)(
    'stands the %s rest on the middle line',
    async (value) => {
      const { root, heads } = await drawn(note('C', value), rest(value))
      const [, , middleLine] = staffLineYs(root)

      expect(Math.abs((heads[1]?.y ?? NaN) - (middleLine ?? NaN))).toBeLessThanOrEqual(1)
    },
  )

  // A whole note has no stem either, so any stem or flag would be a rest's.
  it('draws a rest without a stem or a flag', async () => {
    const { root } = await drawn(note('C', 'whole'), rest('eighth'), rest('sixteenth'))

    expect(all(root, '.vf-stem')).toHaveLength(0)
    expect(all(root, '.vf-flag')).toHaveLength(0)
  })

  it('reports the places of the notes alone, each over its own notehead', async () => {
    widthOfElements(1000)
    const { layout, heads, width, height } = await drawn(
      rest('quarter'),
      note('C', 'quarter'),
      rest('eighth'),
      note('E', 'eighth'),
      note('G', 'quarter'),
    )
    const noteheads = heads.filter((head) => !RESTS.includes(head.glyph))

    expect(heads).toHaveLength(5)
    expect(noteheads).toHaveLength(3)
    expect(layout.notes).toHaveLength(3)
    layout.notes.forEach((place, index) => {
      expect(
        Math.abs(place.x * width - (noteheads[index]?.x ?? NaN)),
        `note ${index + 1} across`,
      ).toBeLessThanOrEqual(1)
      expect(
        Math.abs(place.y * height - (noteheads[index]?.y ?? NaN)),
        `note ${index + 1} down`,
      ).toBeLessThanOrEqual(2)
    })
  })

  // A target over a note stops halfway to a neighbouring rest, so the rests have places too.
  it('reports the places of the rests, each over its glyph and on its line', async () => {
    widthOfElements(1000)
    const { layout, heads, width } = await drawn(
      rest('quarter'),
      note('C', 'quarter'),
      rest('eighth'),
      note('E', 'eighth'),
      note('G', 'quarter'),
    )
    const restGlyphs = heads.filter((head) => RESTS.includes(head.glyph))

    expect(layout.rests).toHaveLength(2)
    layout.rests.forEach((place, index) => {
      expect(
        Math.abs(place.x * width - (restGlyphs[index]?.x ?? NaN)),
        `rest ${index + 1}`,
      ).toBeLessThanOrEqual(1)
      expect(place.line).toBe(0)
    })
  })

  it('draws the rests in reading order with the notes, left to right', async () => {
    widthOfElements(1000)
    const { heads } = await drawn(
      note('C', 'quarter'),
      rest('quarter'),
      note('E', 'quarter'),
      rest('quarter'),
    )

    heads.slice(1).forEach(({ x }, index) => expect(x).toBeGreaterThan(heads[index]?.x ?? Infinity))
  })
})

describe('StaffView with rests on a narrow element', () => {
  const eighths = (count: number, withRests: boolean): NoteOrRest[] =>
    Array.from({ length: count }, (_, index) =>
      withRests && index % 2 === 0 ? rest('eighth') : note(index % 4 < 2 ? 'C' : 'E', 'eighth'),
    )

  // Eight notes either way: eight quarters, or eight eighths with a rest before each.
  it('gives a rest a place on the line as a note has', async () => {
    widthOfElements(328)
    const quarters = Array.from({ length: 8 }, (_, index) =>
      note(index % 2 === 0 ? 'C' : 'E', 'quarter'),
    )
    const withoutRests = (await drawn(...quarters)).layout.lines.length
    wrapper?.unmount()

    const withRests = (await drawn(...eighths(16, true))).layout.lines.length

    expect(withRests).toBeGreaterThan(withoutRests)
  })

  it('keeps each note at least 44 px from the next note on its line', async () => {
    widthOfElements(328)
    const { layout } = await drawn(...eighths(16, true))

    expect(layout.notes).toHaveLength(8)
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
