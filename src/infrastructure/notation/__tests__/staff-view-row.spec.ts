import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import {
  StaffView,
  type NoteMark,
  type StaffGhost,
  type StaffHeard,
  type StaffLayout,
} from '@/infrastructure/notation'
import type { KeySignature } from '@/domain/key-signature'
import type { Letter, Pitch } from '@/domain/pitch'
import {
  COMMON_TIME,
  createQuestionOf,
  type Duration,
  type Note,
  type Question,
} from '@/domain/question'

// Feature staff-progress-row, slice 2: a row of questions of one note on the staff. With
// `rowLength` (10) the staff is a row of that many slots: `passed`, the notes of the questions of
// the row before, each in a slot of its own, then the notes of the question (criterion 1).
//
// - No time signature; a bar line after each note, passed or current; at the end of the row a
//   single bar line, or the final double one (Barline.type.END) for `rowEnd: 'final'`; between the
//   current note and the end the staff is empty (criteria 2, 3).
// - The slots are as wide as each other, whatever the duration. On a wide screen the staff is as
//   long as the row and a slot of room for the heard note, not the whole width; on a narrow one
//   whose line does not hold ten slots the row is two staves of five, each with its clef and key.
//   How many staves depends on the width and the difficulty, not on the notes passed, so the
//   height stays the same all the session (criteria 5, 6, 12).
// - The passed notes are drawn whole — head, stem, flag, sign, ledger lines — in the colour of the
//   token --color-staff-passed; the staff, the clef and the bar lines in their own (criterion 7).
// - `marks`, `ghosts` and `heard` go by the notes of the question, as does the layout reported by
//   `drawn`: the passed notes have no marks, ghosts or heard note (criteria 9, 11).
// - A change of `passed`, `rowLength` or `rowEnd` draws the staff again; a change of `heard` does
//   not.
//
// Lead's decision in slice 2: the adapter does not know the difficulty, so the session gives it
// `rowSlots`, what the difficulty may draw in a row: the most key signs, whether a note may have a
// sign before it, whether it may have a flag. The width of a slot, the number of staves (1 or 2) and
// the length of the staff come from `rowSlots` and the width of the screen alone, never from the
// notes shown, so that a slot keeps its place when a note with a sign first comes (criterion 5).
// Unless said otherwise the row is of Confident reading with one note: no signs, flags.
//
// jsdom has no layout, so the width of the element is stubbed: 1000 px on a wide screen, 343 px on
// a phone 375 px wide. Glyphs have no width in jsdom, so a notehead's x is its centre.

const PASSED = '#a1b2c3'
const CORRECT = '#123456'
const WRONG = '#654321'
const HEARD = '#135790'
// noteheadBlack, noteheadHalf, noteheadWhole and noteheadDoubleWhole of SMuFL.
const HEADS = ['\uE0A4', '\uE0A3', '\uE0A2', '\uE0A0']
const G_CLEF = ''
const HEAD = '\uE0A4'

const ROW = 10
const WIDE = 1000
const NARROW = 343

let tokens: HTMLStyleElement | undefined
let wrapper: VueWrapper | undefined

beforeEach(() => {
  tokens = document.head.appendChild(document.createElement('style'))
  tokens.textContent = `:root { --color-staff-passed: ${PASSED}; --color-correct: ${CORRECT};
    --color-wrong: ${WRONG}; --color-heard: ${HEARD}; }`
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  tokens?.remove()
  tokens = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const LETTERS: readonly Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B']

const pitch = (letter: Letter, octave: number): Pitch => ({ letter, octave })

const note = (at: Pitch, value: Duration['value'] = 'quarter'): Note => ({
  pitch: at,
  duration: { value },
})

const F_SHARP_4: Note = {
  pitch: { letter: 'F', octave: 4, alteration: 1 },
  duration: { value: 'eighth' },
  accidental: 'sharp',
}

// D4, E4, F4…: neighbours never share a pitch, and none needs a ledger line.
const passedNotes = (count: number, value: Duration['value'] = 'quarter'): Note[] =>
  Array.from({ length: count }, (_, index) =>
    note(pitch(LETTERS[(index + 1) % LETTERS.length] as Letter, 4), value),
  )

const NO_SIGNS: KeySignature = { count: 0 }

const questionOf = (current: Note, keySignature: KeySignature = NO_SIGNS): Question =>
  createQuestionOf(COMMON_TIME, [current], keySignature)

// B4 stands on the middle line, above all the passed notes but G4–A4.
const CURRENT = note(pitch('B', 4))

interface RowSlots {
  keySignatures: number
  signs: boolean
  flags: boolean
}

const FIRST_STEPS: RowSlots = { keySignatures: 0, signs: false, flags: false }
const ONE_NOTE_READING: RowSlots = { keySignatures: 0, signs: false, flags: true }
const WITH_SIGNS: RowSlots = { keySignatures: 0, signs: true, flags: false }
const ADVANCED: RowSlots = { keySignatures: 4, signs: true, flags: true }

interface Row {
  rowSlots?: RowSlots
  passed?: readonly Note[]
  rowLength?: number
  rowEnd?: 'single' | 'final'
  marks?: readonly (NoteMark | null)[]
  ghosts?: readonly (StaffGhost | null)[]
  heard?: StaffHeard | null
}

function screenOf(width: number) {
  vi.stubGlobal('innerWidth', width === WIDE ? 1440 : 375)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width)
}

async function drawn(question: Question, row: Row = {}, width = WIDE) {
  screenOf(width)
  wrapper = mount(StaffView, {
    props: {
      question,
      label: 'Music staff',
      rowLength: ROW,
      rowEnd: 'single',
      rowSlots: ONE_NOTE_READING,
      ...row,
    },
    attachTo: document.body,
  })
  const view = wrapper
  await vi.waitFor(() => expect(view.emitted('drawn')).toBeDefined())
  return { root: view.element as Element, view, layout: reported(view) }
}

function reported(view: VueWrapper): StaffLayout {
  const [layout] = (view.emitted('drawn')?.at(-1) ?? []) as [StaffLayout?]
  if (!layout) throw new Error('nothing drawn')
  return layout
}

const all = (root: Element, selector: string) => [...root.querySelectorAll(selector)]

const vexflowSvg = (root: Element) => {
  const svg = all(root, 'svg').find((each) => each.querySelector('.vf-stave'))
  if (!svg) throw new Error('no staff drawn')
  return svg
}

function viewBoxOf(root: Element): number[] {
  return (vexflowSvg(root).getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number)
}

const staveNotes = (root: Element) =>
  all(root, '.vf-stavenote').filter((group) => !group.closest('.vf-ghost, .heard-layer'))

interface Head {
  readonly x: number
  readonly y: number
  readonly group: Element
}

// The head of each note drawn, in the order of the drawing: the passed notes, then the current one.
const headsOf = (root: Element): Head[] =>
  staveNotes(root).map((group) => {
    const head = all(group, '.vf-notehead text').find((text) =>
      HEADS.includes(text.textContent ?? ''),
    )
    if (!head) throw new Error('a note without a head')
    return { x: Number(head.getAttribute('x')), y: Number(head.getAttribute('y')), group }
  })

// The x of every point of the paths of the staff lines of each stave.
function staves(root: Element) {
  return all(root, '.vf-stave').map((stave) => {
    const points = all(stave, 'path').flatMap((path) =>
      [...(path.getAttribute('d') ?? '').matchAll(/[ML]\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/g)].map(
        (match) => ({ x: Number(match[1]), y: Number(match[2]) }),
      ),
    )
    const xs = points.map(({ x }) => x)
    const ys = points.map(({ y }) => y)
    return {
      left: Math.min(...xs),
      right: Math.max(...xs),
      top: Math.min(...ys),
      bottom: Math.max(...ys),
    }
  })
}

type Stave = ReturnType<typeof staves>[number]

const onStave = (stave: Stave, y: number) => y > stave.top - 40 && y < stave.bottom + 40

// Each bar line of the drawing with its rectangles, by its place.
function barlines(root: Element) {
  return all(root, '.vf-stavebarline').map((group) => {
    const rects = all(group, 'rect').map((rect) => ({
      x: Number(rect.getAttribute('x')),
      y: Number(rect.getAttribute('y')),
      width: Number(rect.getAttribute('width')),
    }))
    return {
      group,
      x: Math.max(...rects.map(({ x, width }) => x + width)),
      y: Math.min(...rects.map(({ y }) => y)),
      widths: rects.map(({ width }) => width).sort((a, b) => a - b),
    }
  })
}

type Barline = ReturnType<typeof barlines>[number]

const barlinesOn = (root: Element, stave: Stave): Barline[] =>
  barlines(root).filter(({ y }) => onStave(stave, y + 1))

// The bar lines strictly between two x, without the same line drawn twice.
const barlinesBetween = (lines: readonly Barline[], left: number, right: number) => [
  ...new Set(lines.filter(({ x }) => x > left && x < right).map(({ x }) => Math.round(x))),
]

// SVG paints an element as the nearest of itself and its groups that sets the property, by its
// style or its attribute: VexFlow sets the colour of a note on its group.
function paintOf(element: Element, property: 'fill' | 'stroke') {
  for (
    let each: Element | null = element;
    each && each.tagName !== 'svg';
    each = each.parentElement
  ) {
    const styled = each instanceof SVGElement ? each.style.getPropertyValue(property) : ''
    const value = styled || each.getAttribute(property)
    if (value) return value.trim().toLowerCase().replace(/\s/g, '')
  }
  return null
}

// The colour is the token's, written as its value or as the token itself.
const isPassedColour = (colour: string | null) =>
  colour === PASSED || colour === 'var(--color-staff-passed)'

function coloursOf(group: Element) {
  return [
    ...all(group, 'text').map((text) => paintOf(text, 'fill')),
    ...all(group, 'path').map((path) => paintOf(path, 'stroke')),
  ]
}

function expectPassedColour(group: Element) {
  const colours = coloursOf(group)
  expect(colours.length).toBeGreaterThan(0)
  expect(colours.filter((colour) => !isPassedColour(colour))).toEqual([])
}

const hasPassedColour = (group: Element) => coloursOf(group).some(isPassedColour)

describe('a row on a wide screen (criteria 1, 2)', () => {
  it('draws the passed notes, then the note of the question right of the last of them', async () => {
    const { root } = await drawn(questionOf(CURRENT), { passed: passedNotes(3) })

    const heads = headsOf(root)
    expect(heads).toHaveLength(4)
    heads.slice(1).forEach(({ x }, index) => expect(x).toBeGreaterThan(heads[index]?.x ?? Infinity))
    // The last one drawn is B4, on the middle line, above the passed notes D4, E4 and F4.
    expect(Math.min(...heads.map(({ y }) => y))).toBe(heads.at(-1)?.y)
  })

  it('draws the note of the question alone on the first question of a row', async () => {
    const { root } = await drawn(questionOf(CURRENT), { passed: [] })

    expect(headsOf(root)).toHaveLength(1)
  })

  it('draws them all on one staff, with one clef and no time signature', async () => {
    const { root, layout } = await drawn(questionOf(CURRENT), { passed: passedNotes(9) })

    expect(staves(root)).toHaveLength(1)
    expect(layout.lines).toHaveLength(1)
    expect(all(root, '.vf-clef text').map((text) => text.textContent)).toEqual([G_CLEF])
    expect(all(root, '.vf-timesignature')).toHaveLength(0)
  })

  it('draws a bar line after each note, passed or current', async () => {
    const { root } = await drawn(questionOf(CURRENT), { passed: passedNotes(4) })

    const [stave] = staves(root) as [Stave]
    const lines = barlinesOn(root, stave)
    const heads = headsOf(root)
    heads
      .slice(1)
      .forEach(({ x }, index) =>
        expect(
          barlinesBetween(lines, heads[index]?.x ?? 0, x),
          `bar lines after note ${index + 1}`,
        ).toHaveLength(1),
      )
    const current = heads.at(-1)?.x ?? Infinity
    // The bar line after the current note and the one at the end of the row.
    const after = barlinesBetween(lines, current, stave.right + 1)
    expect(after.length).toBeGreaterThanOrEqual(2)
  })

  it('leaves the staff empty between the bar line after the current note and the end', async () => {
    const { root } = await drawn(questionOf(CURRENT), { passed: passedNotes(2) })

    const [stave] = staves(root) as [Stave]
    const current = headsOf(root).at(-1)?.x ?? Infinity
    const [afterCurrent = Infinity] = barlinesBetween(barlinesOn(root, stave), current, Infinity)
    expect(headsOf(root).filter(({ x }) => x > afterCurrent)).toEqual([])
    // Seven slots are left of the ten: the staff goes on well past the bar line.
    expect(stave.right - afterCurrent).toBeGreaterThan(5 * (afterCurrent - current))
  })

  it('draws nothing as a rest or a hidden note in the empty slots', async () => {
    const { root } = await drawn(questionOf(CURRENT), { passed: passedNotes(2) })

    expect(staveNotes(root)).toHaveLength(3)
  })
})

describe('the end of a row (criterion 3)', () => {
  const lastBarline = (root: Element) => {
    const [stave] = staves(root) as [Stave]
    const lines = barlinesOn(root, stave)
    const right = Math.max(...lines.map(({ x }) => x))
    return { stave, end: lines.filter(({ x }) => Math.abs(x - right) < 0.5) }
  }

  it('is a single bar line at the end of the staff', async () => {
    const { root } = await drawn(questionOf(CURRENT), { passed: passedNotes(3), rowEnd: 'single' })

    const { stave, end } = lastBarline(root)
    expect(end.flatMap(({ widths }) => widths)).toEqual([1])
    expect(Math.abs((end[0]?.x ?? 0) - stave.right)).toBeLessThanOrEqual(1)
  })

  it('is the final double bar line, a thin line and a thick one, in the last row', async () => {
    const { root } = await drawn(questionOf(CURRENT), { passed: passedNotes(3), rowEnd: 'final' })

    const { stave, end } = lastBarline(root)
    const widths = end.flatMap(({ widths }) => widths).sort((a, b) => a - b)
    expect(widths).toHaveLength(2)
    expect(widths[1]).toBeGreaterThan(widths[0] ?? Infinity)
    expect(Math.abs((end[0]?.x ?? 0) - stave.right)).toBeLessThanOrEqual(1)
  })

  it('stands at the end of the row on its first question too', async () => {
    const { root } = await drawn(questionOf(CURRENT), { passed: [], rowEnd: 'final' })

    const { end } = lastBarline(root)
    expect(end.flatMap(({ widths }) => widths)).toHaveLength(2)
  })
})

describe('the slots of a row (criterion 5)', () => {
  it('are as wide as each other whatever the duration', async () => {
    const passed = [
      note(pitch('D', 4), 'whole'),
      note(pitch('E', 4), 'eighth'),
      note(pitch('F', 4), 'half'),
      note(pitch('G', 4), 'sixteenth'),
      note(pitch('A', 4), 'quarter'),
    ]
    const { root } = await drawn(questionOf(note(pitch('C', 5), 'whole')), { passed })

    const xs = headsOf(root).map(({ x }) => x)
    expect(xs).toHaveLength(6)
    const gaps = xs.slice(1).map((x, index) => x - (xs[index] ?? 0))
    for (const gap of gaps) expect(Math.abs(gap - (gaps[0] ?? 0))).toBeLessThanOrEqual(2)
  })

  it('give each note at least 44 px', async () => {
    const { root } = await drawn(questionOf(CURRENT), { passed: passedNotes(9) })

    const xs = headsOf(root).map(({ x }) => x)
    expect(xs).toHaveLength(10)
    xs.slice(1).forEach((x, index) => expect(x - (xs[index] ?? 0)).toBeGreaterThanOrEqual(44))
  })

  it('stand where they stand whatever is passed: the current note is in the slot after them', async () => {
    const before = (await drawn(questionOf(CURRENT), { passed: passedNotes(9) })).root
    const tenth = headsOf(before).map(({ x }) => x)
    wrapper?.unmount()

    const { root } = await drawn(questionOf(CURRENT), { passed: passedNotes(3) })

    expect(headsOf(root).at(-1)?.x).toBeCloseTo(tenth[3] ?? Infinity, 0)
  })

  it('end in a staff as long as the row and a slot of room, not the whole width', async () => {
    const { root } = await drawn(questionOf(CURRENT), { passed: passedNotes(9) })

    const [stave] = staves(root) as [Stave]
    const xs = headsOf(root).map(({ x }) => x)
    const slot = (xs[1] ?? 0) - (xs[0] ?? 0)
    const last = xs.at(-1) ?? 0
    expect(stave.right - stave.left).toBeLessThan(WIDE * 0.85)
    // The tenth note, its bar line and a slot for the heard note.
    expect(stave.right - last).toBeGreaterThan(slot)
    expect(stave.right - last).toBeLessThan(2.5 * slot)
  })

  it('keep the length of the staff whatever is passed', async () => {
    const full = staves((await drawn(questionOf(CURRENT), { passed: passedNotes(9) })).root)
    wrapper?.unmount()

    const empty = staves((await drawn(questionOf(CURRENT), { passed: [] })).root)

    expect(empty).toHaveLength(1)
    expect((empty[0]?.right ?? 0) - (empty[0]?.left ?? 0)).toBeLessThan(WIDE * 0.85)
    expect(empty[0]?.right).toBeCloseTo(full[0]?.right ?? Infinity, 0)
  })

  it('are wider when the difficulty has signs, all of them alike', async () => {
    const plain = headsOf(
      (await drawn(questionOf(CURRENT), { passed: passedNotes(3), rowSlots: FIRST_STEPS })).root,
    )
    wrapper?.unmount()

    const { root } = await drawn(questionOf(CURRENT), {
      passed: passedNotes(3),
      rowSlots: WITH_SIGNS,
    })

    const signed = headsOf(root)
    expect(signed).toHaveLength(4)
    const gap = (heads: Head[]) => (heads[1]?.x ?? 0) - (heads[0]?.x ?? 0)
    expect(gap(signed)).toBeGreaterThan(gap(plain))
    expect(staves(root)).toHaveLength(1)
  })

  it('keep their places when a note with a sign first comes in the row', async () => {
    const before = await drawn(questionOf(CURRENT), {
      passed: passedNotes(3),
      rowSlots: WITH_SIGNS,
    })
    const plainHeads = headsOf(before.root).map(({ x }) => x)
    const plainStaves = staves(before.root)
    wrapper?.unmount()

    const { root } = await drawn(questionOf(F_SHARP_4), {
      passed: passedNotes(3),
      rowSlots: WITH_SIGNS,
    })

    const signedHeads = headsOf(root).map(({ x }) => x)
    expect(signedHeads).toHaveLength(4)
    signedHeads
      .slice(0, 3)
      .forEach((x, index) => expect(x).toBeCloseTo(plainHeads[index] ?? Infinity, 0))
    // The head of the current note stays in its slot, at most the width of its sign apart.
    expect(Math.abs((signedHeads[3] ?? 0) - (plainHeads[3] ?? Infinity))).toBeLessThan(15)
    expect(staves(root).map(({ right }) => Math.round(right))).toEqual(
      plainStaves.map(({ right }) => Math.round(right)),
    )
  })

  it('keep their places when a note with a flag first comes in the row', async () => {
    const before = await drawn(questionOf(CURRENT), {
      passed: passedNotes(3),
      rowSlots: ONE_NOTE_READING,
    })
    const plainHeads = headsOf(before.root).map(({ x }) => x)
    wrapper?.unmount()

    const { root } = await drawn(questionOf(note(pitch('B', 4), 'eighth')), {
      passed: passedNotes(3),
      rowSlots: ONE_NOTE_READING,
    })

    const flaggedHeads = headsOf(root).map(({ x }) => x)
    expect(flaggedHeads).toHaveLength(4)
    flaggedHeads.forEach((x, index) => expect(x).toBeCloseTo(plainHeads[index] ?? Infinity, 0))
  })
})

describe('a row of First steps on a narrow screen (criteria 5, 6)', () => {
  it('draws one bar line between each two notes, and after the tenth the end of the row', async () => {
    const { root } = await drawn(
      questionOf(CURRENT),
      { passed: passedNotes(9), rowSlots: FIRST_STEPS },
      NARROW,
    )

    const [stave] = staves(root) as [Stave]
    const lines = barlinesOn(root, stave)
    const heads = headsOf(root)
    expect(heads).toHaveLength(10)
    heads
      .slice(1)
      .forEach(({ x }, index) =>
        expect(
          barlinesBetween(lines, heads[index]?.x ?? 0, x),
          `bar lines after note ${index + 1}`,
        ).toHaveLength(1),
      )
    const current = heads.at(-1)?.x ?? Infinity
    // The bar of the tenth note holds the room for the heard note and ends with the row: one bar
    // line after it, at the right end of the staff.
    const after = barlinesBetween(lines, current, stave.right + 1)
    expect(after).toHaveLength(1)
    expect(Math.abs((after[0] ?? 0) - stave.right)).toBeLessThanOrEqual(1)
  })

  it('is one staff of ten slots', async () => {
    const { root, layout } = await drawn(
      questionOf(CURRENT),
      { passed: passedNotes(9), rowSlots: FIRST_STEPS },
      NARROW,
    )

    expect(staves(root)).toHaveLength(1)
    expect(layout.lines).toHaveLength(1)
    expect(all(root, '.vf-clef')).toHaveLength(1)
    expect(headsOf(root)).toHaveLength(10)
    const [, , width = 0] = viewBoxOf(root)
    const [stave] = staves(root) as [Stave]
    expect(stave.right).toBeLessThanOrEqual(width)
  })

  it('keeps one staff of the same length and height on the first question of a row', async () => {
    const full = await drawn(
      questionOf(CURRENT),
      { passed: passedNotes(9), rowSlots: FIRST_STEPS },
      NARROW,
    )
    const [, , , fullHeight] = viewBoxOf(full.root)
    const [fullStave] = staves(full.root)
    wrapper?.unmount()

    const { root } = await drawn(questionOf(CURRENT), { passed: [], rowSlots: FIRST_STEPS }, NARROW)

    expect(staves(root)).toHaveLength(1)
    expect(viewBoxOf(root)[3]).toBe(fullHeight)
    expect(staves(root)[0]?.right).toBeCloseTo(fullStave?.right ?? Infinity, 0)
  })

  it.each<[string, RowSlots]>([
    ['signs', WITH_SIGNS],
    ['flags', ONE_NOTE_READING],
    ['key signatures, signs and flags', ADVANCED],
  ])('is two staves when the difficulty has %s', async (_, rowSlots) => {
    const { root, layout } = await drawn(
      questionOf(CURRENT),
      { passed: passedNotes(9), rowSlots },
      NARROW,
    )

    expect(staves(root)).toHaveLength(2)
    expect(layout.lines).toHaveLength(2)
  })

  it('is two staves for the same slots whether its notes have signs or not', async () => {
    const { root } = await drawn(
      questionOf(CURRENT),
      { passed: passedNotes(9), rowSlots: WITH_SIGNS },
      NARROW,
    )

    expect(headsOf(root).length).toBe(10)
    expect(staves(root)).toHaveLength(2)
  })
})

describe('a row on a narrow screen (criteria 5, 6, 12)', () => {
  it('is two staves of five notes, each with its clef', async () => {
    const { root, layout } = await drawn(questionOf(CURRENT), { passed: passedNotes(9) }, NARROW)

    const lines = staves(root)
    expect(lines).toHaveLength(2)
    expect(layout.lines).toHaveLength(2)
    expect(all(root, '.vf-clef')).toHaveLength(2)
    const heads = headsOf(root)
    const [first, second] = lines as [Stave, Stave]
    expect(heads.filter(({ y }) => onStave(first, y))).toHaveLength(5)
    expect(heads.filter(({ y }) => onStave(second, y))).toHaveLength(5)
    expect(all(root, '.vf-timesignature')).toHaveLength(0)
  })

  it('gives each staff its key signature', async () => {
    const { root } = await drawn(
      questionOf(CURRENT, { count: 1, accidental: 'sharp' }),
      { passed: passedNotes(6), rowSlots: { ...ONE_NOTE_READING, keySignatures: 1 } },
      NARROW,
    )

    expect(all(root, '.vf-clef')).toHaveLength(2)
    expect(all(root, '.vf-keysignature')).toHaveLength(2)
  })

  it('has two staves on the first question of a row too: the height does not change', async () => {
    const full = await drawn(questionOf(CURRENT), { passed: passedNotes(9) }, NARROW)
    const [, , , fullHeight] = viewBoxOf(full.root)
    const fullRatio = getComputedStyle(full.view.element).aspectRatio
    wrapper?.unmount()

    const { root, layout, view } = await drawn(questionOf(CURRENT), { passed: [] }, NARROW)

    expect(staves(root)).toHaveLength(2)
    expect(layout.lines).toHaveLength(2)
    expect(viewBoxOf(root)[3]).toBe(fullHeight)
    expect(getComputedStyle(view.element).aspectRatio).toBe(fullRatio)
  })

  it('puts the sixth note of the row at the start of the second staff', async () => {
    const { layout } = await drawn(questionOf(CURRENT), { passed: passedNotes(5) }, NARROW)

    expect(layout.notes.map(({ line }) => line)).toEqual([1])
  })

  it('keeps the fifth note of the row on the first staff', async () => {
    const { layout } = await drawn(questionOf(CURRENT), { passed: passedNotes(4) }, NARROW)

    expect(layout.notes.map(({ line }) => line)).toEqual([0])
  })

  it('ends the first staff with the bar line of its fifth note, the second with the end of the row', async () => {
    const { root } = await drawn(
      questionOf(CURRENT),
      { passed: passedNotes(9), rowEnd: 'final' },
      NARROW,
    )

    expect(staves(root)).toHaveLength(2)
    const [first, second] = staves(root) as [Stave, Stave]
    const widthsAtEnd = (stave: Stave) =>
      barlinesOn(root, stave)
        .filter(({ x }) => Math.abs(x - stave.right) <= 1)
        .flatMap(({ widths }) => widths)
    expect(widthsAtEnd(first)).toHaveLength(1)
    expect(widthsAtEnd(second)).toHaveLength(2)
  })
})

describe('the passed notes (criterion 7)', () => {
  it('are drawn in the colour of --color-staff-passed, the note of the question in its own', async () => {
    const { root } = await drawn(questionOf(CURRENT), { passed: passedNotes(3) })

    const heads = headsOf(root)
    expect(heads).toHaveLength(4)
    for (const { group } of heads.slice(0, -1)) expectPassedColour(group)
    expect(hasPassedColour(heads.at(-1)?.group as Element)).toBe(false)
  })

  it('are coloured whole: the head, the stem, the flag, the sign and the ledger lines', async () => {
    // C4 stands on a ledger line; F♯4 an eighth note with its sign.
    const passed = [note(pitch('C', 4), 'eighth'), F_SHARP_4]
    const { root } = await drawn(questionOf(CURRENT), {
      passed,
      rowSlots: { keySignatures: 0, signs: true, flags: true },
    })

    const [c4, fSharp] = headsOf(root)
    expect(all(c4?.group as Element, '.vf-flag')).toHaveLength(1)
    expect(all(fSharp?.group as Element, '.vf-stem')).toHaveLength(1)
    // The stem and the ledger line of C4.
    expect(all(c4?.group as Element, 'path').length).toBeGreaterThanOrEqual(2)
    // The head, the sign and the flag of F♯4.
    expect(all(fSharp?.group as Element, 'text').length).toBeGreaterThanOrEqual(3)
    expectPassedColour(c4?.group as Element)
    expectPassedColour(fSharp?.group as Element)
  })

  it('leave the staff, the clef and the bar lines in their own colour', async () => {
    const { root } = await drawn(questionOf(CURRENT), { passed: passedNotes(3) })

    const others = [
      ...all(root, '.vf-stave path').map((path) => paintOf(path, 'stroke')),
      ...all(root, '.vf-clef text').map((text) => paintOf(text, 'fill')),
      ...all(root, '.vf-stavebarline rect').map((rect) => paintOf(rect, 'fill')),
    ]
    expect(others.length).toBeGreaterThan(0)
    expect(others.filter(isPassedColour)).toEqual([])
  })

  it('are not made pale by opacity', async () => {
    const { root } = await drawn(questionOf(CURRENT), { passed: passedNotes(3) })

    const heads = headsOf(root)
    expect(heads).toHaveLength(4)
    // VexFlow lays a transparent rectangle over each note to take the pointer.
    const isPointerRect = (element: Element) =>
      element.tagName === 'rect' && element.getAttribute('pointer-events') === 'auto'
    const ancestors = (element: Element) => {
      const found: Element[] = []
      for (let each = element.parentElement; each; each = each.parentElement) found.push(each)
      return found
    }
    const faded = heads
      .flatMap(({ group }) => [group, ...all(group, '*'), ...ancestors(group)])
      .filter(
        (element) =>
          !isPointerRect(element) &&
          (element.getAttribute('opacity') !== null ||
            (element instanceof SVGElement && element.style.opacity !== '')),
      )
    expect(faded).toEqual([])
  })

  it('take the colour from the token as it is when drawn', async () => {
    if (tokens) tokens.textContent = ':root { --color-staff-passed: #0a0b0c; }'

    const { root } = await drawn(questionOf(CURRENT), { passed: passedNotes(1) })

    const colours = coloursOf(headsOf(root)[0]?.group as Element)
    expect(colours.every((colour) => colour === '#0a0b0c' || isPassedColour(colour))).toBe(true)
    expect(colours.length).toBeGreaterThan(0)
  })
})

describe('the result and the heard note in a row (criteria 9–11)', () => {
  it('marks the note of the question by its index, the passed notes keeping their colour', async () => {
    const { root } = await drawn(questionOf(CURRENT), {
      passed: passedNotes(3),
      marks: ['wrong'],
    })

    const heads = headsOf(root)
    expect(heads).toHaveLength(4)
    const current = coloursOf(heads.at(-1)?.group as Element)
    expect(current.length).toBeGreaterThan(0)
    expect(current.every((colour) => colour === WRONG)).toBe(true)
    for (const { group } of heads.slice(0, -1)) expectPassedColour(group)
  })

  it('draws the ghost of the answer in the column of the note of the question', async () => {
    const { root } = await drawn(questionOf(CURRENT), {
      passed: passedNotes(3),
      marks: ['correct'],
      ghosts: [{ pitch: pitch('D', 5), mark: 'wrong' }],
    })

    const ghosts = all(root, '.vf-ghost ellipse').map((ellipse) =>
      Number(ellipse.getAttribute('cx')),
    )
    const heads = headsOf(root)
    expect(heads).toHaveLength(4)
    const current = heads.at(-1)?.x ?? Infinity
    const slot = current - (heads.at(-2)?.x ?? -Infinity)
    expect(ghosts).toHaveLength(1)
    expect(Math.abs((ghosts[0] ?? Infinity) - current)).toBeLessThan(slot / 2)
  })

  it('reports the place of the note of the question alone', async () => {
    const { root, layout } = await drawn(questionOf(CURRENT), { passed: passedNotes(3) })

    const [, , width = 1] = viewBoxOf(root)
    expect(layout.notes).toHaveLength(1)
    expect((layout.notes[0]?.x ?? 0) * width).toBeCloseTo(headsOf(root).at(-1)?.x ?? Infinity, 0)
  })

  it('draws the heard note right of the note of the question, within the row', async () => {
    const { root } = await drawn(questionOf(CURRENT), {
      passed: passedNotes(9),
      heard: { column: 0, pitch: pitch('A', 4) },
    })

    const heard = all(root, '.heard-note text').filter((text) => text.textContent === HEAD)
    const heads = headsOf(root)
    expect(heads).toHaveLength(10)
    const current = heads.at(-1)?.x ?? Infinity
    const slot = current - (heads.at(-2)?.x ?? -Infinity)
    const [stave] = staves(root) as [Stave]
    expect(heard).toHaveLength(1)
    const x = Number(heard[0]?.getAttribute('x'))
    expect(x).toBeGreaterThan(current)
    expect(x).toBeLessThan(current + slot)
    expect(x).toBeLessThan(stave.right)
  })

  it('keeps the drawing from screen readers and the label on the staff', async () => {
    const { view, root } = await drawn(questionOf(CURRENT), { passed: passedNotes(3) })

    expect(view.element.getAttribute('role')).toBe('img')
    expect(view.element.getAttribute('aria-label')).toBe('Music staff')
    expect(vexflowSvg(root).getAttribute('aria-hidden')).toBe('true')
  })
})

describe('drawing a row again', () => {
  it('draws again for new passed notes', async () => {
    const { root, view } = await drawn(questionOf(CURRENT), { passed: passedNotes(1) })

    await view.setProps({ passed: passedNotes(2) })

    await vi.waitFor(() => expect(headsOf(root)).toHaveLength(3))
    expect(all(root, '.vf-stave').length).toBe(1)
  })

  it('draws again for another end of the row', async () => {
    const { root, view } = await drawn(questionOf(CURRENT), { passed: [], rowEnd: 'single' })

    await view.setProps({ rowEnd: 'final' })

    await vi.waitFor(() => {
      const widths = barlines(root).flatMap(({ widths }) => widths)
      expect(widths.some((width) => width > 1)).toBe(true)
    })
  })

  it('draws again as a staff without a row once the row is gone', async () => {
    const { root, view } = await drawn(questionOf(CURRENT), { passed: passedNotes(2) })

    await view.setProps({ passed: undefined, rowLength: undefined, rowEnd: undefined })

    await vi.waitFor(() => expect(headsOf(root)).toHaveLength(1))
    expect(all(root, '.vf-timesignature')).toHaveLength(1)
  })

  it('does not draw again for the heard note', async () => {
    const { view } = await drawn(questionOf(CURRENT), { passed: passedNotes(2) })
    const times = view.emitted('drawn')?.length

    await view.setProps({ heard: { column: 0, pitch: pitch('A', 4) } })
    await vi.waitFor(() => expect(view.element.querySelector('.heard-note')).not.toBeNull())

    expect(view.emitted('drawn')?.length).toBe(times)
  })
})
