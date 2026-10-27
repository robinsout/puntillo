import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import {
  StaffView,
  type NoteMark,
  type StaffGhost,
  type StaffLayout,
} from '@/infrastructure/notation'
import type { Alteration, Letter, Pitch } from '@/domain/pitch'
import {
  COMMON_TIME,
  createQuestionOf,
  type Note,
  type NoteOrRest,
  type Question,
} from '@/domain/question'

// Feature heard-note-on-staff, slice 1: the note the microphone hears is drawn on the staff. The
// prop `heard`, { column, pitch } or { column, beyond: 'up' | 'down' } or null, the column being the
// index of a note of the question, rests aside, as for `marks` and `ghosts`, is drawn on a layer of
// its own: an <svg class="heard-layer"> with the viewBox of the drawing, aria-hidden, not
// focusable and not taking the pointer, over the drawing of VexFlow (criteria 7, 8). Giving,
// moving or taking away the heard note does not draw the staff again: the nodes of VexFlow stay as
// they are and `drawn` is not emitted again (criterion 7).
//
// A pitch is drawn as the group `heard-note`: the black head of Bravura (noteheadBlack, U+E0A4) as
// large as the heads of the question, on the step of the pitch, right of the note of its column and
// of a ghost there (criterion 2), with its ledger lines as <line>s and, for a sharp, the sign before
// it; no stem (out of scope). A note beyond three ledger lines is drawn as the group `heard-arrow`
// in its column instead: a stem <line> and a <polygon> head, above the staff pointing up or below
// it pointing down (edge case 3). All of it in the colour of the token --color-heard.
//
// jsdom has no layout, so glyphs have no width and a glyph's x is its left edge, as VexFlow
// writes it.

const HEARD = '#135790'
const HEAD = ''
const SHARP = ''
const HEADS = ['', '', '']
// Half the narrowest slot of a note: a thing nearer to its note than this is in its column.
const HALF_SLOT = 24

let tokens: HTMLStyleElement | undefined
let wrapper: VueWrapper | undefined

beforeEach(() => {
  tokens = document.head.appendChild(document.createElement('style'))
  tokens.textContent = `:root { --color-heard: ${HEARD}; --color-correct: #123456; --color-wrong: #654321; }`
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  tokens?.remove()
  tokens = undefined
  vi.restoreAllMocks()
})

const pitch = (letter: Letter, octave: number, alteration?: Alteration): Pitch =>
  alteration === undefined ? { letter, octave } : { letter, octave, alteration }

const note = (at: Pitch): Note => ({
  pitch: at,
  duration: { value: 'quarter' },
  ...(at.alteration === 1 && { accidental: 'sharp' as const }),
})

const REST: NoteOrRest = { duration: { value: 'quarter' } }

const questionOf = (...elements: NoteOrRest[]): Question => createQuestionOf(COMMON_TIME, elements)

type Heard = { column: number; pitch: Pitch } | { column: number; beyond: 'up' | 'down' } | null

interface Drawing {
  heard?: Heard
  marks?: readonly (NoteMark | null)[]
  ghosts?: readonly (StaffGhost | null)[]
}

async function drawn(question: Question, drawing: Drawing = {}) {
  wrapper = mount(StaffView, {
    props: { question, label: 'Music staff', ...drawing },
    attachTo: document.body,
  })
  const view = wrapper
  await vi.waitFor(() => expect(view.emitted('drawn')).toBeDefined())
  const [layout] = (view.emitted('drawn')?.at(-1) ?? []) as [StaffLayout?]
  return { root: view.element as Element, view, layout }
}

const all = (root: Element, selector: string) => [...root.querySelectorAll(selector)]

// The drawing of VexFlow, not the layer of the heard note.
const vexflowSvg = (root: Element) => all(root, 'svg').find((svg) => svg.querySelector('.vf-stave'))
const layer = (root: Element) => root.querySelector('svg.heard-layer')
const heardNotes = (root: Element) => all(root, '.heard-note')
const heardArrows = (root: Element) => all(root, '.heard-arrow')

// SVG paints an element as the nearest of itself and its groups that sets the property, by its
// style or its attribute.
function paintOf(element: Element, property: string) {
  for (let each: Element | null = element; each; each = each.parentElement) {
    const styled = each instanceof SVGElement ? each.style.getPropertyValue(property) : ''
    const value = styled || each.getAttribute(property)
    if (value) return value.trim().toLowerCase()
    if (each.tagName === 'svg') break
  }
  return null
}

// The colour is the token's, written as its value or as the token itself.
const isHeardColour = (colour: string | null) =>
  colour === HEARD || colour?.replace(/\s/g, '') === 'var(--color-heard)'

function staffLineYs(root: Element): number[] {
  return all(root, '.vf-stave path')
    .map((path) => /^M\s*[\d.-]+[\s,]+([\d.-]+)/.exec(path.getAttribute('d') ?? '')?.[1])
    .filter((y): y is string => y !== undefined)
    .map(Number)
    .sort((a, b) => a - b)
}

// The top and bottom lines of the first staff.
function staffEdges(root: Element) {
  const [top, second, third, fourth, bottom] = staffLineYs(root)
  if ([top, second, third, fourth, bottom].includes(undefined)) throw new Error('staff not drawn')
  return {
    top: top as number,
    bottom: bottom as number,
    space: (second as number) - (top as number),
  }
}

// E4 → 0, C4 → −2, G4 → 2, C5 → 5, on the first staff.
function stepOf(root: Element, y: number): number {
  const { bottom, space } = staffEdges(root)
  return Math.round((bottom - y) / (space / 2))
}

interface Glyph {
  readonly x: number
  readonly y: number
  readonly element: Element
}

const glyphOf = (text: Element): Glyph => ({
  x: Number(text.getAttribute('x')),
  y: Number(text.getAttribute('y')),
  element: text,
})

const staveNotes = (root: Element) =>
  all(root, '.vf-stavenote').filter((group) => !group.closest('.vf-ghost, .heard-layer'))

// The head of each note of the question, rests aside.
const questionHeads = (root: Element): Glyph[] =>
  staveNotes(root).flatMap((group) => {
    const head = all(group, '.vf-notehead text').find((text) =>
      HEADS.includes(text.textContent ?? ''),
    )
    return head ? [glyphOf(head)] : []
  })

function theHeardNote(root: Element) {
  const groups = heardNotes(root)
  expect(groups).toHaveLength(1)
  const group = groups[0] as Element
  const heads = all(group, 'text').filter((text) => text.textContent === HEAD)
  expect(heads).toHaveLength(1)
  return {
    group,
    head: glyphOf(heads[0] as Element),
    signs: all(group, 'text')
      .filter((text) => text.textContent === SHARP)
      .map(glyphOf),
    ledgerLines: all(group, 'line').map((line) => ({
      x1: Number(line.getAttribute('x1')),
      x2: Number(line.getAttribute('x2')),
      y: Number(line.getAttribute('y1')),
      element: line,
    })),
  }
}

function pointsOf(polygon: Element): { x: number; y: number }[] {
  const numbers = (polygon.getAttribute('points') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number)
  const points: { x: number; y: number }[] = []
  for (let index = 0; index + 1 < numbers.length; index += 2)
    points.push({ x: numbers[index] as number, y: numbers[index + 1] as number })
  return points
}

function theArrow(root: Element) {
  const groups = heardArrows(root)
  expect(groups).toHaveLength(1)
  const group = groups[0] as Element
  const stems = all(group, 'line')
  const heads = all(group, 'polygon')
  expect(stems).toHaveLength(1)
  expect(heads).toHaveLength(1)
  const stem = stems[0] as Element
  const head = heads[0] as Element
  const stemPoints = [
    { x: Number(stem.getAttribute('x1')), y: Number(stem.getAttribute('y1')) },
    { x: Number(stem.getAttribute('x2')), y: Number(stem.getAttribute('y2')) },
  ]
  const headPoints = pointsOf(head)
  expect(headPoints.length).toBeGreaterThanOrEqual(3)
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
  return {
    stem,
    head,
    ys: [...stemPoints, ...headPoints].map(({ y }) => y),
    x: mean([...stemPoints, ...headPoints].map(({ x }) => x)),
    stemMiddle: mean(stemPoints.map(({ y }) => y)),
    headMiddle: mean(headPoints.map(({ y }) => y)),
  }
}

describe('StaffView without a heard note', () => {
  it('draws no heard note and no arrow', async () => {
    const { root } = await drawn(questionOf(note(pitch('G', 4))))

    expect(heardNotes(root)).toHaveLength(0)
    expect(heardArrows(root)).toHaveLength(0)
  })

  it('draws no heard note and no arrow for null', async () => {
    const { root } = await drawn(questionOf(note(pitch('G', 4))), { heard: null })

    expect(heardNotes(root)).toHaveLength(0)
    expect(heardArrows(root)).toHaveLength(0)
  })
})

describe('the layer of the heard note (criteria 7, 8)', () => {
  const heardG4 = { column: 0, pitch: pitch('G', 4) }

  it('is an svg of its own, after the drawing of VexFlow, with its viewBox', async () => {
    const { root } = await drawn(questionOf(note(pitch('G', 4))), { heard: heardG4 })

    const own = layer(root)
    const drawing = vexflowSvg(root)
    expect(own).not.toBeNull()
    expect(drawing).toBeDefined()
    expect(own).not.toBe(drawing)
    expect(own?.contains(theHeardNote(root).group)).toBe(true)
    expect(own?.getAttribute('viewBox')).toBe(drawing?.getAttribute('viewBox'))
    expect(
      ((drawing as Element).compareDocumentPosition(own as Element) &
        Node.DOCUMENT_POSITION_FOLLOWING) !==
        0,
    ).toBe(true)
  })

  it('is hidden from screen readers and from the focus', async () => {
    const { root } = await drawn(questionOf(note(pitch('G', 4))), { heard: heardG4 })

    expect(layer(root)?.getAttribute('aria-hidden')).toBe('true')
    expect(layer(root)?.getAttribute('focusable')).toBe('false')
  })

  it('lets the pointer through to what is under it', async () => {
    const { root } = await drawn(questionOf(note(pitch('G', 4))), { heard: heardG4 })

    const own = layer(root) as SVGElement
    expect([own.style.pointerEvents, own.getAttribute('pointer-events')]).toContain('none')
  })

  it('leaves the accessible name of the staff as it is', async () => {
    const { root } = await drawn(questionOf(note(pitch('G', 4))), { heard: heardG4 })

    const image = root.matches('[role="img"]') ? root : root.querySelector('[role="img"]')
    expect(image?.getAttribute('aria-label')).toBe('Music staff')
    expect(image?.contains(layer(root))).toBe(true)
  })
})

describe('the staff under the heard note is not drawn again (criterion 7)', () => {
  it('keeps the nodes of the drawing when a heard note comes, moves and goes', async () => {
    const question = questionOf(note(pitch('G', 4)), note(pitch('C', 5)))
    const { root, view } = await drawn(question)
    const svg = vexflowSvg(root)
    const before = all(root, '.vf-stave, .vf-stavenote')

    await view.setProps({ heard: { column: 0, pitch: pitch('A', 4) } })
    await vi.waitFor(() => expect(heardNotes(root)).toHaveLength(1))
    await view.setProps({ heard: { column: 1, pitch: pitch('D', 5) } })
    await vi.waitFor(() => expect(stepOf(root, theHeardNote(root).head.y)).toBe(6))
    await view.setProps({ heard: { column: 1, beyond: 'up' } })
    await vi.waitFor(() => expect(heardArrows(root)).toHaveLength(1))
    await view.setProps({ heard: null })
    await vi.waitFor(() => expect(heardArrows(root)).toHaveLength(0))

    expect(vexflowSvg(root)).toBe(svg)
    const after = all(root, '.vf-stave, .vf-stavenote')
    expect(after).toHaveLength(before.length)
    after.forEach((element, index) => expect(element).toBe(before[index]))
    expect(view.emitted('drawn')).toHaveLength(1)
  })

  it('moves the head to the new step when the note heard changes', async () => {
    const { root, view } = await drawn(questionOf(note(pitch('G', 4))), {
      heard: { column: 0, pitch: pitch('A', 4) },
    })
    expect(stepOf(root, theHeardNote(root).head.y)).toBe(3)

    await view.setProps({ heard: { column: 0, pitch: pitch('E', 4) } })

    await vi.waitFor(() => expect(stepOf(root, theHeardNote(root).head.y)).toBe(0))
  })

  it('takes the heard note away in silence', async () => {
    const { root, view } = await drawn(questionOf(note(pitch('G', 4))), {
      heard: { column: 0, pitch: pitch('A', 4) },
    })

    await view.setProps({ heard: null })

    await vi.waitFor(() => expect(heardNotes(root)).toHaveLength(0))
    expect(heardArrows(root)).toHaveLength(0)
  })
})

describe('the head of the heard note (criteria 1, 2)', () => {
  it('stands on the step of the note of the question when it is that note', async () => {
    const { root } = await drawn(questionOf(note(pitch('G', 4))), {
      heard: { column: 0, pitch: pitch('G', 4) },
    })

    const [questionHead] = questionHeads(root)
    expect(theHeardNote(root).head.y).toBeCloseTo(questionHead?.y ?? NaN, 5)
  })

  it.each<[Letter, number, number]>([
    ['E', 4, 0],
    ['A', 4, 3],
    ['C', 5, 5],
    ['F', 5, 8],
    ['G', 5, 9],
    ['D', 4, -1],
  ])('stands on the step of %s%i: %i', async (letter, octave, step) => {
    const { root } = await drawn(questionOf(note(pitch('G', 4))), {
      heard: { column: 0, pitch: pitch(letter, octave) },
    })

    expect(stepOf(root, theHeardNote(root).head.y)).toBe(step)
  })

  it('is the black head of Bravura, as large as the heads of the question', async () => {
    const { root } = await drawn(questionOf(note(pitch('G', 4))), {
      heard: { column: 0, pitch: pitch('C', 5) },
    })

    const { head } = theHeardNote(root)
    const [questionHead] = questionHeads(root)
    expect(paintOf(head.element, 'font-family')).toContain('bravura')
    expect(paintOf(head.element, 'font-size')).toBe(
      paintOf(questionHead?.element as Element, 'font-size'),
    )
  })

  it('is filled in the colour of --color-heard, not see-through', async () => {
    const { root } = await drawn(questionOf(note(pitch('G', 4))), {
      heard: { column: 0, pitch: pitch('C', 5) },
    })

    const { head } = theHeardNote(root)
    expect(isHeardColour(paintOf(head.element, 'fill'))).toBe(true)
    expect(['1', null]).toContain(paintOf(head.element, 'opacity'))
    expect(['1', null]).toContain(paintOf(head.element, 'fill-opacity'))
  })

  it('has no stem', async () => {
    const { root } = await drawn(questionOf(note(pitch('G', 4))), {
      heard: { column: 0, pitch: pitch('C', 5) },
    })

    const { group } = theHeardNote(root)
    expect(all(group, '.vf-stem, path')).toHaveLength(0)
  })

  it('stands right of the note of its column', async () => {
    const { root } = await drawn(questionOf(note(pitch('G', 4))), {
      heard: { column: 0, pitch: pitch('G', 4) },
    })

    const [questionHead] = questionHeads(root)
    const { head } = theHeardNote(root)
    expect(head.x).toBeGreaterThan(questionHead?.x ?? Infinity)
    expect(head.x - (questionHead?.x ?? Infinity)).toBeLessThan(HALF_SLOT)
  })

  it('stands in the column given, between its note and the next one', async () => {
    const { root } = await drawn(
      questionOf(note(pitch('C', 5)), note(pitch('E', 4)), note(pitch('G', 4))),
      { heard: { column: 1, pitch: pitch('A', 4) } },
    )

    const [, second, third] = questionHeads(root)
    const { head } = theHeardNote(root)
    expect(head.x).toBeGreaterThan(second?.x ?? Infinity)
    expect(head.x).toBeLessThan(third?.x ?? -Infinity)
  })

  it('counts the columns by the notes, rests aside', async () => {
    const { root } = await drawn(questionOf(note(pitch('C', 5)), REST, note(pitch('E', 4))), {
      heard: { column: 1, pitch: pitch('E', 4) },
    })

    const [, last] = questionHeads(root)
    const { head } = theHeardNote(root)
    expect(head.x).toBeGreaterThan(last?.x ?? Infinity)
    expect(head.x - (last?.x ?? Infinity)).toBeLessThan(HALF_SLOT)
    expect(head.y).toBeCloseTo(last?.y ?? NaN, 5)
  })

  it('stands right of a ghost in its column too', async () => {
    const { root } = await drawn(questionOf(note(pitch('C', 5))), {
      marks: ['correct'],
      ghosts: [{ pitch: pitch('D', 5), mark: 'wrong' }],
      heard: { column: 0, pitch: pitch('B', 4) },
    })

    const ghost = root.querySelector('.vf-ghost ellipse') as Element
    const ghostRight = Number(ghost.getAttribute('cx')) + Number(ghost.getAttribute('rx'))
    expect(theHeardNote(root).head.x).toBeGreaterThan(ghostRight)
  })

  it('stands on the line of the staff its note is on', async () => {
    const eight = Array.from({ length: 8 }, (_, index) =>
      note(index % 2 === 0 ? pitch('C', 5) : pitch('G', 4)),
    )
    const { root, layout } = await drawn(questionOf(...eight), {
      heard: { column: 7, pitch: pitch('G', 4) },
    })
    expect(layout?.lines.length).toBeGreaterThan(1)

    const last = questionHeads(root).at(-1)
    const { head } = theHeardNote(root)
    expect(head.y).toBeCloseTo(last?.y ?? NaN, 5)
    expect(head.x).toBeGreaterThan(last?.x ?? Infinity)
    expect(head.x - (last?.x ?? Infinity)).toBeLessThan(HALF_SLOT)
  })

  it('is drawn once the staff is, when it was given before', async () => {
    const { root } = await drawn(questionOf(note(pitch('G', 4))), {
      heard: { column: 0, pitch: pitch('B', 4) },
    })

    expect(stepOf(root, theHeardNote(root).head.y)).toBe(4)
  })

  it('goes to the column of the new question once it is drawn', async () => {
    const { root, view } = await drawn(
      questionOf(note(pitch('C', 5)), note(pitch('E', 4)), note(pitch('G', 4))),
      { heard: { column: 2, pitch: pitch('G', 4) } },
    )

    await view.setProps({
      question: questionOf(note(pitch('A', 4))),
      heard: { column: 0, pitch: pitch('A', 4) },
    })

    await vi.waitFor(() => expect(view.emitted('drawn')).toHaveLength(2))
    const [only] = questionHeads(root)
    const { head } = theHeardNote(root)
    expect(head.y).toBeCloseTo(only?.y ?? NaN, 5)
    expect(head.x).toBeGreaterThan(only?.x ?? Infinity)
    expect(head.x - (only?.x ?? Infinity)).toBeLessThan(HALF_SLOT)
  })
})

describe('the ledger lines of the heard note (criterion 1)', () => {
  it.each<[Letter, number, number[]]>([
    ['C', 4, [-2]],
    ['B', 3, [-2]],
    ['A', 3, [-2, -4]],
    ['F', 3, [-2, -4, -6]],
    ['E', 3, [-2, -4, -6]],
    ['A', 5, [10]],
    ['C', 6, [10, 12]],
    ['F', 6, [10, 12, 14]],
  ])('are drawn for %s%i on the steps %o', async (letter, octave, steps) => {
    const { root } = await drawn(questionOf(note(pitch('G', 4))), {
      heard: { column: 0, pitch: pitch(letter, octave) },
    })

    const { ledgerLines } = theHeardNote(root)
    expect(ledgerLines.map(({ y }) => stepOf(root, y)).sort((a, b) => a - b)).toEqual(
      [...steps].sort((a, b) => a - b),
    )
  })

  it('are none for a note on or next to the staff', async () => {
    const { root } = await drawn(questionOf(note(pitch('G', 4))), {
      heard: { column: 0, pitch: pitch('G', 5) },
    })

    expect(theHeardNote(root).ledgerLines).toHaveLength(0)
  })

  it('cross the head, in the colour of --color-heard', async () => {
    const { root } = await drawn(questionOf(note(pitch('G', 4))), {
      heard: { column: 0, pitch: pitch('A', 3) },
    })

    const { head, ledgerLines } = theHeardNote(root)
    for (const { x1, x2, element } of ledgerLines) {
      expect(Math.min(x1, x2)).toBeLessThanOrEqual(head.x)
      expect(Math.max(x1, x2)).toBeGreaterThan(head.x)
      expect(isHeardColour(paintOf(element, 'stroke'))).toBe(true)
    }
  })
})

describe('the sign of a heard black key (slice 1: written with a sharp)', () => {
  it('is a sharp before the head, at its height, in the colour of --color-heard', async () => {
    const { root } = await drawn(questionOf(note(pitch('G', 4))), {
      heard: { column: 0, pitch: pitch('F', 4, 1) },
    })

    const { head, signs } = theHeardNote(root)
    expect(stepOf(root, head.y)).toBe(1)
    expect(signs).toHaveLength(1)
    expect(signs[0]?.x).toBeLessThan(head.x)
    expect(signs[0]?.y).toBeCloseTo(head.y, 5)
    expect(isHeardColour(paintOf(signs[0]?.element as Element, 'fill'))).toBe(true)
  })

  it('is none for a white key', async () => {
    const { root } = await drawn(questionOf(note(pitch('G', 4))), {
      heard: { column: 0, pitch: pitch('F', 4) },
    })

    expect(theHeardNote(root).signs).toHaveLength(0)
  })
})

describe('the arrow for a note beyond three ledger lines (edge case 3)', () => {
  it('stands above the staff and points up for a note above', async () => {
    const { root } = await drawn(questionOf(note(pitch('G', 4))), {
      heard: { column: 0, beyond: 'up' },
    })

    const arrow = theArrow(root)
    const { top } = staffEdges(root)
    expect(heardNotes(root)).toHaveLength(0)
    expect(Math.max(...arrow.ys)).toBeLessThan(top)
    expect(arrow.headMiddle).toBeLessThan(arrow.stemMiddle)
  })

  it('stands below the staff and points down for a note below', async () => {
    const { root } = await drawn(questionOf(note(pitch('G', 4))), {
      heard: { column: 0, beyond: 'down' },
    })

    const arrow = theArrow(root)
    const { bottom } = staffEdges(root)
    expect(heardNotes(root)).toHaveLength(0)
    expect(Math.min(...arrow.ys)).toBeGreaterThan(bottom)
    expect(arrow.headMiddle).toBeGreaterThan(arrow.stemMiddle)
  })

  it('stands in the column given', async () => {
    const { root } = await drawn(
      questionOf(note(pitch('C', 5)), note(pitch('E', 4)), note(pitch('G', 4))),
      { heard: { column: 1, beyond: 'up' } },
    )

    const [first, second, third] = questionHeads(root)
    const { x } = theArrow(root)
    const from = (head?: Glyph) => Math.abs(x - (head?.x ?? Infinity))
    expect(from(second)).toBeLessThan(HALF_SLOT)
    expect(from(second)).toBeLessThan(from(first))
    expect(from(second)).toBeLessThan(from(third))
  })

  it('is drawn in the colour of --color-heard', async () => {
    const { root } = await drawn(questionOf(note(pitch('G', 4))), {
      heard: { column: 0, beyond: 'down' },
    })

    const { stem, head } = theArrow(root)
    expect(isHeardColour(paintOf(stem, 'stroke'))).toBe(true)
    expect(isHeardColour(paintOf(head, 'fill'))).toBe(true)
  })

  it('is on the layer of the heard note', async () => {
    const { root } = await drawn(questionOf(note(pitch('G', 4))), {
      heard: { column: 0, beyond: 'up' },
    })

    expect(layer(root)?.contains(heardArrows(root)[0] as Element)).toBe(true)
  })
})
