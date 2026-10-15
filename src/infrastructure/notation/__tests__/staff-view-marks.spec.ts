import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { StaffView, type NoteMark, type StaffGhost } from '@/infrastructure/notation'
import type { Letter, Pitch } from '@/domain/pitch'
import {
  COMMON_TIME,
  createQuestionOf,
  type Accidental,
  type Duration,
  type Note,
  type NoteOrRest,
  type Question,
  type WrittenNote,
} from '@/domain/question'

// Feature design-system, slice 3, criterion 13: once a question is checked the staff shows the
// result. The prop `marks`, one per note of the question, null for none, colours each note whole —
// its head, stem, flag, dot, sign and ledger lines — in the colour of the token --color-correct or
// --color-wrong; the rests keep their colour. The prop `ghosts`, one per note of the question, null
// for none, draws a head in outline in the column of the note, on the step of its pitch, without a
// stem: the group `vf-ghost` holds one ellipse, its outline in the colour of the ghost's mark,
// dashed for a wrong one, the answer of Read notes, and solid for a right one, the right note of
// Write notes. Without the props the staff is drawn as before.
//
// The colours are read from the tokens, not written in the adapter: the test gives the tokens
// values of its own. jsdom has no layout, so glyphs have no width and a head's x is its centre.

const CORRECT = '#123456'
const WRONG = '#654321'

let tokens: HTMLStyleElement | undefined
let wrapper: VueWrapper | undefined

beforeEach(() => {
  tokens = document.head.appendChild(document.createElement('style'))
  tokens.textContent = `:root { --color-correct: ${CORRECT}; --color-wrong: ${WRONG}; }`
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  tokens?.remove()
  tokens = undefined
  vi.restoreAllMocks()
})

const pitch = (letter: Letter, octave: number): Pitch => ({ letter, octave })

const note = (
  at: Pitch,
  value: Duration['value'] = 'quarter',
  extra: { dots?: 1; accidental?: Accidental } = {},
): Note => ({
  pitch: extra.accidental === 'sharp' ? { ...at, alteration: 1 } : at,
  duration: extra.dots ? { value, dots: 1 } : { value },
  ...(extra.accidental && { accidental: extra.accidental }),
})

const REST: NoteOrRest = { duration: { value: 'quarter' } }

const questionOf = (...elements: NoteOrRest[]): Question => createQuestionOf(COMMON_TIME, elements)

interface Marking {
  marks?: readonly (NoteMark | null)[]
  ghosts?: readonly (StaffGhost | null)[]
  written?: readonly (WrittenNote | null)[]
}

async function drawn(question: Question, marking: Marking = {}) {
  wrapper = mount(StaffView, {
    props: { question, label: 'Music staff', ...marking },
    attachTo: document.body,
  })
  const view = wrapper
  await vi.waitFor(() => expect(view.emitted('drawn')).toBeDefined())
  return { root: view.element as Element, view }
}

const all = (root: Element, selector: string) => [...root.querySelectorAll(selector)]

// SVG paints an element as the nearest of itself and its groups that sets the property, by its
// style or its attribute: VexFlow sets the colour of a note on its group.
function paintOf(element: Element, property: 'fill' | 'stroke' | 'stroke-dasharray') {
  for (
    let each: Element | null = element;
    each && each.tagName !== 'svg';
    each = each.parentElement
  ) {
    const styled = each instanceof SVGElement ? each.style.getPropertyValue(property) : ''
    const value = styled || each.getAttribute(property)
    if (value) return value.trim().toLowerCase()
  }
  return null
}

const colourOf = (element: Element, property: 'fill' | 'stroke') => paintOf(element, property)

// The colours a stave note is drawn in: the fill of its glyphs and the stroke of its lines.
function coloursOf(group: Element) {
  return {
    glyphs: all(group, 'text').map((text) => colourOf(text, 'fill')),
    lines: all(group, 'path').map((path) => colourOf(path, 'stroke')),
  }
}

const staveNotes = (root: Element) =>
  all(root, '.vf-stavenote').filter((group) => !group.closest('.vf-ghost'))

const isMarked = (colour: string | null) => colour === CORRECT || colour === WRONG

function expectDrawnIn(group: Element | undefined, colour: string) {
  if (!group) throw new Error('note not drawn')
  const { glyphs, lines } = coloursOf(group)
  expect(glyphs.length).toBeGreaterThan(0)
  expect(glyphs.every((each) => each === colour)).toBe(true)
  expect(lines.every((each) => each === colour)).toBe(true)
}

function expectUnmarked(group: Element | undefined) {
  if (!group) throw new Error('note not drawn')
  const { glyphs, lines } = coloursOf(group)
  expect([...glyphs, ...lines].some(isMarked)).toBe(false)
}

function staffLineYs(root: Element): number[] {
  return all(root, '.vf-stave path')
    .map((path) => /^M\s*[\d.-]+[\s,]+([\d.-]+)/.exec(path.getAttribute('d') ?? '')?.[1])
    .filter((y): y is string => y !== undefined)
    .map(Number)
    .sort((a, b) => a - b)
}

// E4 → 0, C4 → −2, G4 → 2, C5 → 5.
function stepOf(root: Element, y: number): number {
  const lines = staffLineYs(root)
  const [top, second] = lines
  const bottom = lines.at(-1)
  if (top === undefined || second === undefined || bottom === undefined)
    throw new Error('staff not rendered')
  return Math.round((bottom - y) / ((second - top) / 2))
}

// The heads of the drawn notes, without the dots and the signs that VexFlow groups with them.
const HEADS = ['', '', '']
const headXs = (root: Element) =>
  staveNotes(root).map((group) => {
    const head = all(group, '.vf-notehead text').find((text) =>
      HEADS.includes(text.textContent ?? ''),
    )
    return Number(head?.getAttribute('x'))
  })

interface Ghost {
  x: number
  step: number
  stroke: string | null
  fill: string | null
  dashed: boolean
  hasStem: boolean
}

function ghostsOf(root: Element): Ghost[] {
  return all(root, '.vf-ghost').map((group) => {
    const shapes = all(group, 'ellipse')
    expect(shapes).toHaveLength(1)
    const [ellipse] = shapes as [Element]
    const dash = paintOf(ellipse, 'stroke-dasharray')
    return {
      x: Number(ellipse.getAttribute('cx')),
      step: stepOf(root, Number(ellipse.getAttribute('cy'))),
      stroke: colourOf(ellipse, 'stroke'),
      fill: colourOf(ellipse, 'fill'),
      dashed: dash !== null && dash !== 'none',
      hasStem: all(group, '.vf-stem, path, text').length > 0,
    }
  })
}

// Half the narrowest slot of a note: a ghost nearer to its note than this is in its column.
const HALF_SLOT = 24

describe('StaffView without marks', () => {
  it('draws the notes in their own colour and no ghost', async () => {
    const { root } = await drawn(questionOf(note(pitch('C', 4)), note(pitch('G', 4))))

    for (const group of staveNotes(root)) expectUnmarked(group)
    expect(all(root, '.vf-ghost')).toHaveLength(0)
  })
})

describe('StaffView with marks', () => {
  it('draws a right note in the colour of --color-correct', async () => {
    const { root } = await drawn(questionOf(note(pitch('G', 4))), { marks: ['correct'] })

    expectDrawnIn(staveNotes(root)[0], CORRECT)
  })

  it('draws a wrong note in the colour of --color-wrong', async () => {
    const { root } = await drawn(questionOf(note(pitch('G', 4))), { marks: ['wrong'] })

    expectDrawnIn(staveNotes(root)[0], WRONG)
  })

  it('colours the whole note: its head, stem, flag, dot, sign and ledger lines', async () => {
    const { root } = await drawn(
      questionOf(note(pitch('A', 3), 'eighth', { dots: 1, accidental: 'sharp' })),
      { marks: ['wrong'] },
    )

    const [group] = staveNotes(root)
    expect(all(group as Element, '.vf-stem')).toHaveLength(1)
    expect(all(group as Element, '.vf-flag')).toHaveLength(1)
    // A3 stands below the second ledger line: the stem and two ledger lines.
    expect(coloursOf(group as Element).lines).toHaveLength(3)
    // The head, the dot and the sign, and the flag.
    expect(coloursOf(group as Element).glyphs).toHaveLength(4)
    expectDrawnIn(group, WRONG)
  })

  it('colours each note by its own mark, and leaves a note without one as it is', async () => {
    const { root } = await drawn(
      questionOf(note(pitch('C', 5)), note(pitch('E', 4)), note(pitch('G', 4))),
      { marks: ['correct', 'wrong', null] },
    )

    const [first, second, third] = staveNotes(root)
    expectDrawnIn(first, CORRECT)
    expectDrawnIn(second, WRONG)
    expectUnmarked(third)
  })

  it('leaves the rests in their own colour, the marks going to the notes alone', async () => {
    const { root } = await drawn(questionOf(note(pitch('C', 5)), REST, note(pitch('E', 4))), {
      marks: ['correct', 'wrong'],
    })

    const [first, rest, last] = staveNotes(root)
    expectDrawnIn(first, CORRECT)
    expectUnmarked(rest)
    expectDrawnIn(last, WRONG)
  })

  it('takes the colours from the tokens as they are when drawn', async () => {
    if (tokens) tokens.textContent = ':root { --color-correct: #0a0b0c; --color-wrong: #0c0b0a; }'

    const { root } = await drawn(questionOf(note(pitch('G', 4))), { marks: ['correct'] })

    expectDrawnIn(staveNotes(root)[0], '#0a0b0c')
  })

  it('redraws with the marks once they are given, and without them once they are gone', async () => {
    const question = questionOf(note(pitch('G', 4)))
    const { root, view } = await drawn(question)

    await view.setProps({ marks: ['wrong'], ghosts: [{ pitch: pitch('B', 4), mark: 'wrong' }] })

    await vi.waitFor(() => expectDrawnIn(staveNotes(root)[0], WRONG))
    expect(ghostsOf(root)).toHaveLength(1)

    await view.setProps({ marks: undefined, ghosts: undefined })

    await vi.waitFor(() => expectUnmarked(staveNotes(root)[0]))
    expect(all(root, '.vf-ghost')).toHaveLength(0)
    expect(all(root, 'svg')).toHaveLength(1)
  })
})

describe('StaffView with ghosts', () => {
  it('draws the answer of a wrong note as a dashed outline of a head, on its step', async () => {
    const { root } = await drawn(questionOf(note(pitch('C', 5))), {
      marks: ['wrong'],
      ghosts: [{ pitch: pitch('F', 4), mark: 'wrong' }],
    })

    const [ghost] = ghostsOf(root)
    expect(ghostsOf(root)).toHaveLength(1)
    expect(ghost?.step).toBe(1)
    expect(ghost?.stroke).toBe(WRONG)
    expect(ghost?.fill).toBe('none')
    expect(ghost?.dashed).toBe(true)
  })

  it('draws the ghost without a stem, the note keeping its own', async () => {
    const { root } = await drawn(questionOf(note(pitch('C', 5))), {
      marks: ['wrong'],
      ghosts: [{ pitch: pitch('F', 4), mark: 'wrong' }],
    })

    expect(ghostsOf(root)[0]?.hasStem).toBe(false)
    expect(all(root, '.vf-stem')).toHaveLength(1)
  })

  it('draws the ghost in the column of its note', async () => {
    const { root } = await drawn(
      questionOf(note(pitch('C', 5)), note(pitch('E', 4)), note(pitch('G', 4))),
      {
        marks: ['correct', 'wrong', 'correct'],
        ghosts: [null, { pitch: pitch('A', 4), mark: 'wrong' }, null],
      },
    )

    const [ghost] = ghostsOf(root)
    const [first = 0, second = 0, third = 0] = headXs(root)
    expect(ghostsOf(root)).toHaveLength(1)
    expect(ghost?.step).toBe(3)
    expect(Math.abs((ghost?.x ?? Infinity) - second)).toBeLessThan(HALF_SLOT)
    expect(Math.abs((ghost?.x ?? Infinity) - second)).toBeLessThan(Math.abs(second - first))
    expect(Math.abs((ghost?.x ?? Infinity) - second)).toBeLessThan(Math.abs(third - second))
  })

  it('places a ghost below the staff on its ledger line step', async () => {
    const { root } = await drawn(questionOf(note(pitch('G', 4))), {
      marks: ['wrong'],
      ghosts: [{ pitch: pitch('C', 4), mark: 'wrong' }],
    })

    expect(ghostsOf(root)[0]?.step).toBe(-2)
  })

  it('draws a ghost for each note that has one, in the order of the notes', async () => {
    const { root } = await drawn(questionOf(note(pitch('C', 5)), REST, note(pitch('E', 4))), {
      marks: ['wrong', 'wrong'],
      ghosts: [
        { pitch: pitch('D', 5), mark: 'wrong' },
        { pitch: pitch('G', 4), mark: 'wrong' },
      ],
    })

    const ghosts = ghostsOf(root)
    const [first = 0, , last = 0] = headXs(root)
    expect(ghosts.map(({ step }) => step)).toEqual([6, 2])
    expect(Math.abs((ghosts[0]?.x ?? Infinity) - first)).toBeLessThan(HALF_SLOT)
    expect(Math.abs((ghosts[1]?.x ?? Infinity) - last)).toBeLessThan(HALF_SLOT)
  })

  it('draws a right ghost as a solid outline in the colour of --color-correct', async () => {
    const { root } = await drawn(questionOf(note(pitch('C', 5))), {
      marks: ['wrong'],
      ghosts: [{ pitch: pitch('C', 5), mark: 'correct' }],
    })

    const [ghost] = ghostsOf(root)
    expect(ghost?.stroke).toBe(CORRECT)
    expect(ghost?.fill).toBe('none')
    expect(ghost?.dashed).toBe(false)
  })
})

describe('StaffView in Write notes with marks', () => {
  const written = (at: Pitch): WrittenNote => ({ pitch: at, duration: { value: 'quarter' } })

  it('colours the written notes by their marks', async () => {
    const { root } = await drawn(questionOf(note(pitch('G', 4)), note(pitch('C', 5))), {
      written: [written(pitch('G', 4)), written(pitch('A', 4))],
      marks: ['correct', 'wrong'],
    })

    const [first, second] = staveNotes(root)
    expectDrawnIn(first, CORRECT)
    expectDrawnIn(second, WRONG)
  })

  it('draws the right note of a wrong one solid in its column, the written one on its step', async () => {
    const { root } = await drawn(questionOf(note(pitch('G', 4))), {
      written: [written(pitch('F', 4))],
      marks: ['wrong'],
      ghosts: [{ pitch: pitch('G', 4), mark: 'correct' }],
    })

    const [ghost] = ghostsOf(root)
    const [head = 0] = headXs(root)
    expect(ghost?.step).toBe(2)
    expect(ghost?.stroke).toBe(CORRECT)
    expect(ghost?.dashed).toBe(false)
    expect(Math.abs((ghost?.x ?? Infinity) - head)).toBeLessThan(HALF_SLOT)
    const noteHead = all(staveNotes(root)[0] as Element, '.vf-notehead text')[0]
    expect(stepOf(root, Number(noteHead?.getAttribute('y')))).toBe(1)
  })
})
