import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { StaffView } from '@/infrastructure/notation'
import type { StaffLayout } from '@/infrastructure/notation'
import type { Letter } from '@/domain/pitch'
import {
  createQuestionIn,
  type Duration,
  type Question,
  type TimeSignature,
} from '@/domain/question'

// Feature multi-note-questions, slice 3: bars, the time signature of the question and lines of the
// staff (criteria 4 and 8).
//
// The drawing is as wide as the element it is drawn in. On a narrow element a long question goes
// on to further lines of the staff, so that a note has at least 44 px across: a target over it
// spans halfway to its neighbours. Every line starts with a clef; the time signature stands once,
// at the start of the first line. Bar lines stand between bars, and a line that ends inside a bar
// ends without one. The places of the notes come with their line, and each line with its band of
// the drawing's height, as fractions.
//
// jsdom has no layout, so the width of the element is stubbed; an element of no width stands for
// 360 px. Glyphs have no width in jsdom, so a notehead's x is its centre.

const TIME = { '2': '\uE082', '3': '\uE083', '4': '\uE084', '6': '\uE086', '8': '\uE088' }
const G_CLEF = '\uE050'

const FOUR_FOUR: TimeSignature = { beats: 4, beatValue: 4 }
const THREE_FOUR: TimeSignature = { beats: 3, beatValue: 4 }
const SIX_EIGHT: TimeSignature = { beats: 6, beatValue: 8 }

const LETTERS: Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B']

// Notes rising from C4 and falling back, so that no two neighbours share a pitch.
function questionIn(timeSignature: TimeSignature, ...values: Duration['value'][]): Question {
  const notes = values.map((value, index) => ({
    pitch: { letter: LETTERS[index % LETTERS.length] ?? 'C', octave: 4 },
    duration: { value },
  }))
  const [first, ...rest] = notes
  if (!first) throw new Error('a question needs a note')
  return createQuestionIn(timeSignature, first, ...rest)
}

const times = <T>(count: number, value: T): T[] => Array<T>(count).fill(value)

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
})

function widthOfElements(width: number) {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width)
}

function render(question: Question) {
  wrapper = mount(StaffView, { props: { question, label: 'Music staff' }, attachTo: document.body })
  return wrapper
}

const all = (root: Element, selector: string) => [...root.querySelectorAll(selector)]
const glyphs = (root: Element, selector: string) =>
  all(root, `${selector} text`).map((text) => text.textContent)

function viewBoxOf(root: Element): number[] {
  return (
    root
      .querySelector('svg')
      ?.getAttribute('viewBox')
      ?.split(/[\s,]+/)
      .map(Number) ?? []
  )
}

function reported(view: VueWrapper): StaffLayout {
  const [layout] = (view.emitted('drawn')?.at(-1) ?? []) as [StaffLayout?]
  if (!layout) throw new Error('nothing drawn')
  return layout
}

async function drawn(question: Question) {
  const view = render(question)
  await vi.waitFor(() => expect(view.emitted('drawn')).toBeDefined())
  const [, , width = 0, height = 0] = viewBoxOf(view.element)
  const heads = all(view.element, '.vf-notehead text').map((head) => ({
    x: Number(head.getAttribute('x')),
    y: Number(head.getAttribute('y')),
  }))
  const barlines = all(view.element, '.vf-stavebarline rect').map((rect) => ({
    x: Number(rect.getAttribute('x')),
    y: Number(rect.getAttribute('y')) + Number(rect.getAttribute('height')) / 2,
  }))
  return { view, root: view.element, layout: reported(view), heads, barlines, width, height }
}

type Drawing = Awaited<ReturnType<typeof drawn>>

// The places of the bar lines across the line of the drawing that holds note `index`, in drawing
// units.
function barlinesBeside({ layout, barlines, height }: Drawing, index: number) {
  const line = layout.lines[layout.notes[index]?.line ?? -1]
  if (!line) throw new Error(`note ${index + 1} has no line`)
  const xs = barlines
    .filter(({ y }) => y >= line.top * height && y <= line.bottom * height)
    .map(({ x }) => Math.round(x))
  // Two staves meeting at a bar line may each draw it.
  return [...new Set(xs)]
}

function barlinesBetween(drawing: Drawing, from: number, to: number) {
  const left = drawing.heads[from]?.x ?? Infinity
  const right = drawing.heads[to]?.x ?? -Infinity
  return barlinesBeside(drawing, from).filter((x) => x > left && x < right)
}

describe('StaffView with bars', () => {
  it.each([
    [THREE_FOUR, [TIME['3'], TIME['4']]],
    [SIX_EIGHT, [TIME['6'], TIME['8']]],
    [FOUR_FOUR, [TIME['4'], TIME['4']]],
  ])('draws the time signature of the question: %o', async (timeSignature, digits) => {
    const { root } = await drawn(questionIn(timeSignature, 'quarter'))

    expect(glyphs(root, '.vf-timesignature')).toEqual(digits)
  })

  it('draws a bar line between two bars of 3/4, and none inside a bar', async () => {
    widthOfElements(1000)
    const drawing = await drawn(
      questionIn(THREE_FOUR, 'half', 'quarter', 'quarter', 'quarter', 'quarter'),
    )

    expect(drawing.layout.lines).toHaveLength(1)
    expect(barlinesBetween(drawing, 1, 2)).toHaveLength(1)
    expect(barlinesBetween(drawing, 0, 1)).toEqual([])
    expect(barlinesBetween(drawing, 2, 3)).toEqual([])
    expect(barlinesBetween(drawing, 3, 4)).toEqual([])
  })

  it('draws a bar line between two bars of 6/8', async () => {
    widthOfElements(1000)
    const drawing = await drawn(
      questionIn(SIX_EIGHT, 'quarter', 'eighth', 'quarter', 'eighth', 'half', 'quarter'),
    )

    expect(barlinesBetween(drawing, 3, 4)).toHaveLength(1)
    expect(barlinesBetween(drawing, 4, 5)).toEqual([])
  })

  it('draws the notes of both bars left to right on one line of a wide element', async () => {
    widthOfElements(1000)
    const { layout, heads, root } = await drawn(
      questionIn(FOUR_FOUR, 'half', 'half', 'quarter', 'quarter', 'half'),
    )

    expect(layout.lines).toHaveLength(1)
    expect(layout.notes.map((note) => note.line)).toEqual([0, 0, 0, 0, 0])
    heads.slice(1).forEach(({ x }, index) => expect(x).toBeGreaterThan(heads[index]?.x ?? Infinity))
    expect(glyphs(root, '.vf-clef')).toEqual([G_CLEF])
  })
})

describe('StaffView on a narrow element', () => {
  // Two bars of 4/4 in eighths: sixteen notes, more than a line of 328 px holds.
  const SIXTEEN_EIGHTHS = () => questionIn(FOUR_FOUR, ...times(16, 'eighth' as const))

  it('goes on to further lines, each note at least 44 px from its neighbours on the line', async () => {
    widthOfElements(328)
    const { layout, heads } = await drawn(SIXTEEN_EIGHTHS())

    expect(heads).toHaveLength(16)
    expect(layout.notes).toHaveLength(16)
    expect(layout.lines.length).toBeGreaterThan(1)
    layout.notes.slice(1).forEach((note, index) => {
      const before = layout.notes[index]
      if (!before || before.line !== note.line) return
      expect(
        (note.x - before.x) * 328,
        `notes ${index + 1} and ${index + 2}`,
      ).toBeGreaterThanOrEqual(44)
    })
  })

  it('fills the lines in order, top to bottom, the notes left to right on each', async () => {
    widthOfElements(328)
    const { layout } = await drawn(SIXTEEN_EIGHTHS())

    const lineOf = layout.notes.map((note) => note.line)
    expect(lineOf[0]).toBe(0)
    expect(lineOf.at(-1)).toBe(layout.lines.length - 1)
    const outOfOrder = layout.notes.slice(1).flatMap((note, index) => {
      const before = layout.notes[index]
      if (!before) return []
      const nextLine = note.line === before.line + 1
      const rightwards = note.line === before.line && note.x > before.x
      return nextLine || rightwards ? [] : [`note ${index + 2}`]
    })
    expect(outOfOrder).toEqual([])
    layout.lines.forEach((line, index) => {
      expect(line.top).toBeGreaterThanOrEqual(
        index === 0 ? 0 : (layout.lines[index - 1]?.bottom ?? 1),
      )
      expect(line.bottom).toBeGreaterThan(line.top)
      expect(line.bottom).toBeLessThanOrEqual(1)
    })
  })

  it('places each note within the band of its line', async () => {
    widthOfElements(328)
    const { layout, heads, height } = await drawn(SIXTEEN_EIGHTHS())

    layout.notes.forEach((note, index) => {
      const line = layout.lines[note.line]
      expect(line, `line of note ${index + 1}`).toBeDefined()
      expect(note.y).toBeGreaterThan(line?.top ?? 1)
      expect(note.y).toBeLessThan(line?.bottom ?? 0)
      expect(Math.abs(note.y * height - (heads[index]?.y ?? 0))).toBeLessThanOrEqual(2)
    })
  })

  it('starts every line with a clef and the first one alone with the time signature', async () => {
    widthOfElements(328)
    const { layout, root } = await drawn(SIXTEEN_EIGHTHS())

    expect(glyphs(root, '.vf-clef')).toEqual(times(layout.lines.length, G_CLEF))
    expect(glyphs(root, '.vf-timesignature')).toEqual([TIME['4'], TIME['4']])
    expect(all(root, '.vf-stave path').length).toBeGreaterThanOrEqual(5 * layout.lines.length)
  })

  it('ends a line inside a bar without a bar line, and a bar inside a line with one', async () => {
    widthOfElements(328)
    const drawing = await drawn(SIXTEEN_EIGHTHS())
    const { notes } = drawing.layout

    // The first bar of 4/4 ends after the eighth note.
    const wrong = notes.slice(0, -1).flatMap((note, index) => {
      const endOfBar = index === 7
      if (notes[index + 1]?.line !== note.line) {
        const after = barlinesBeside(drawing, index).filter(
          (x) => x > (drawing.heads[index]?.x ?? 0),
        )
        return endOfBar || after.length === 0
          ? []
          : [`a bar line ends the line of note ${index + 1}`]
      }
      const found = barlinesBetween(drawing, index, index + 1).length
      return found === (endOfBar ? 1 : 0) ? [] : [`${found} bar lines after note ${index + 1}`]
    })
    expect(wrong).toEqual([])
  })

  it('takes one line for four notes on 328 px', async () => {
    widthOfElements(328)
    const { layout, root } = await drawn(
      questionIn(FOUR_FOUR, 'quarter', 'quarter', 'quarter', 'quarter'),
    )

    expect(layout.lines).toHaveLength(1)
    expect(glyphs(root, '.vf-clef')).toHaveLength(1)
  })

  it('takes more lines on a narrower element', async () => {
    widthOfElements(600)
    const wide = (await drawn(SIXTEEN_EIGHTHS())).layout.lines.length
    wrapper?.unmount()
    vi.restoreAllMocks()

    widthOfElements(328)
    const narrow = (await drawn(SIXTEEN_EIGHTHS())).layout.lines.length

    expect(narrow).toBeGreaterThan(wide)
  })

  // As in staff-view.spec.ts: the buttons under the staff must not shift when it is drawn.
  it('reserves the height of all its lines before VexFlow has loaded', async () => {
    widthOfElements(328)
    const view = render(SIXTEEN_EIGHTHS())
    // The width is measured once the element is in the page.
    await nextTick()
    expect(view.element.querySelector('svg')).toBeNull()
    const value = getComputedStyle(view.element).aspectRatio
    const [w, h = 1] = value.split('/').map((part) => Number.parseFloat(part))
    const before = Number(w) / h

    await vi.waitFor(() => expect(view.emitted('drawn')).toBeDefined())

    const [, , width = 0, height = 0] = viewBoxOf(view.element)
    expect(before).toBeCloseTo(width / height, 3)
    expect(reported(view).lines.length).toBeGreaterThan(1)
  })
})
