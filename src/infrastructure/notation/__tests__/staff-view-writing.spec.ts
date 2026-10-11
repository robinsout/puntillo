import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { StaffView, stepAt, type StaffLayout } from '@/infrastructure/notation'
import type { Letter, Pitch } from '@/domain/pitch'
import {
  createQuestion,
  createQuestionOf,
  type Duration,
  type NoteOrRest,
  type Question,
  type WrittenNote,
} from '@/domain/question'

// Feature m2-write-notes, slice 1, criteria 3, 5 and 6: in Write notes the staff shows the clef
// and the time signature without the notes of the question; in the place of each note it draws the
// note written there, if any, with the duration of the question note. The layout still gives the
// place of every note, written or not, for its column, and where the staff lines of each line of
// the staff are, for the touch to find its step. The staff is drawn 1.5 times as large as in Read
// notes, still as wide as its container.
//
// The written notes come in the prop `written`, one per note of the question, null for none.
//
// Slice 2: each written note is drawn with its own duration, its dot with it; a note written
// without a duration yet (null) is a black head without a stem, so that the drawing neither gives
// the duration away nor shows a wrong one. The rests of the question are drawn in their places.
// A long question goes on to further lines, as in Read notes.

const GLYPH = {
  gClef: '',
  timeSig4: '',
  noteheadBlack: '',
  noteheadHalf: '',
  noteheadWhole: '',
  dot: '',
  restQuarter: '',
} as const

const pitch = (letter: Letter, octave: number): Pitch => ({ letter, octave })

const writtenOn = (note: Pitch, duration: Duration | null = { value: 'quarter' }): WrittenNote => ({
  pitch: note,
  duration,
})

const questionOn = (note: Pitch, value: Duration['value'] = 'quarter'): Question =>
  createQuestion({ pitch: note, duration: { value } })

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
})

const all = (root: Element, selector: string) => [...root.querySelectorAll(selector)]

const glyphs = (root: Element, selector: string) =>
  all(root, `${selector} text`).map((text) => text.textContent)

function staffLineYs(root: Element): number[] {
  return all(root, '.vf-stave path')
    .map((path) => /^M\s*[\d.-]+[\s,]+([\d.-]+)/.exec(path.getAttribute('d') ?? '')?.[1])
    .filter((y): y is string => y !== undefined)
    .map(Number)
    .sort((a, b) => a - b)
}

// E4 → 0, G4 → 2, C5 → 5.
function noteStepAboveBottomLine(root: Element): number {
  const lines = staffLineYs(root)
  const [top, second] = lines
  const bottom = lines.at(-1)
  const head = root.querySelector('.vf-notehead text')
  if (top === undefined || second === undefined || bottom === undefined || !head) {
    throw new Error('staff or notehead not rendered')
  }
  const halfSpace = (second - top) / 2
  return Math.round((bottom - Number(head.getAttribute('y'))) / halfSpace)
}

function reported(view: VueWrapper): StaffLayout {
  const [layout] = (view.emitted('drawn')?.at(-1) ?? []) as [StaffLayout?]
  if (!layout) throw new Error('nothing drawn')
  return layout
}

async function drawn(question: Question, written?: readonly (WrittenNote | null)[]) {
  wrapper = mount(StaffView, {
    props: { question, label: 'Music staff', written },
    attachTo: document.body,
  })
  const view = wrapper
  await vi.waitFor(() => expect(view.emitted('drawn')).toBeDefined())
  return { root: view.element as Element, layout: reported(view), view }
}

// Height to width of the drawing: at the same width of the container, a larger staff is taller.
function aspectOf(root: Element): number {
  const [, , width = 0, height = 0] =
    root
      .querySelector('svg')
      ?.getAttribute('viewBox')
      ?.split(/[\s,]+/)
      .map(Number) ?? []
  return height / width
}

describe('StaffView in Write notes', () => {
  describe('before the note is written', () => {
    it('draws the staff with the clef and the time signature', async () => {
      const { root } = await drawn(questionOn(pitch('G', 4)), [null])

      expect(staffLineYs(root)).toHaveLength(5)
      expect(glyphs(root, '.vf-clef')).toEqual([GLYPH.gClef])
      expect(glyphs(root, '.vf-timesignature')).toEqual([GLYPH.timeSig4, GLYPH.timeSig4])
    })

    it('draws no note: the question note is not shown', async () => {
      const { root } = await drawn(questionOn(pitch('G', 4)), [null])

      expect(all(root, '.vf-notehead')).toHaveLength(0)
    })

    it('reports the place of the note, right of the clef and the time signature', async () => {
      const { layout } = await drawn(questionOn(pitch('G', 4)), [null])

      expect(layout.notes).toHaveLength(1)
      const [place] = layout.notes
      const [line] = layout.lines
      expect(place?.line).toBe(0)
      expect(place?.x).toBeGreaterThan(line?.left ?? 1)
      expect(place?.x).toBeLessThan(1)
    })

    it('reports where the top and the bottom staff lines are, the top one above', async () => {
      const { layout } = await drawn(questionOn(pitch('G', 4)), [null])

      const [line] = layout.lines
      expect(line?.topLine).toBeGreaterThan(line?.top ?? 1)
      expect(line?.bottomLine).toBeGreaterThan(line?.topLine ?? 1)
      expect(line?.bottomLine).toBeLessThan(line?.bottom ?? 0)
    })
  })

  describe('with the note written', () => {
    it('draws the written note, not the question note', async () => {
      const { root } = await drawn(questionOn(pitch('C', 5)), [writtenOn(pitch('G', 4))])

      expect(all(root, '.vf-notehead')).toHaveLength(1)
      expect(noteStepAboveBottomLine(root)).toBe(2)
    })

    it('draws it with its written duration, not that of the question note', async () => {
      const { root } = await drawn(questionOn(pitch('C', 5), 'half'), [
        writtenOn(pitch('E', 4), { value: 'quarter' }),
      ])

      expect(glyphs(root, '.vf-notehead')).toEqual([GLYPH.noteheadBlack])
      expect(all(root, '.vf-stem')).toHaveLength(1)
    })

    it('draws a note without a duration yet as a black head without a stem', async () => {
      const { root } = await drawn(questionOn(pitch('C', 5), 'half'), [
        writtenOn(pitch('G', 4), null),
      ])

      expect(glyphs(root, '.vf-notehead')).toEqual([GLYPH.noteheadBlack])
      expect(all(root, '.vf-stem')).toHaveLength(0)
      expect(all(root, '.vf-flag')).toHaveLength(0)
      expect(noteStepAboveBottomLine(root)).toBe(2)
    })

    it('draws a written whole note with its own head and no stem', async () => {
      const { root } = await drawn(questionOn(pitch('C', 5), 'quarter'), [
        writtenOn(pitch('G', 4), { value: 'whole' }),
      ])

      expect(glyphs(root, '.vf-notehead')).toEqual([GLYPH.noteheadWhole])
      expect(all(root, '.vf-stem')).toHaveLength(0)
    })

    it('draws the dot of a dotted written note', async () => {
      const { root } = await drawn(questionOn(pitch('C', 5), 'quarter'), [
        writtenOn(pitch('G', 4), { value: 'half', dots: 1 }),
      ])

      // VexFlow puts the text of the dot into the group of the head, so they are told by glyph.
      const drawnGlyphs = glyphs(root, '.vf-stavenote')
      expect(drawnGlyphs.filter((glyph) => glyph !== GLYPH.dot)).toEqual([GLYPH.noteheadHalf])
      expect(drawnGlyphs.filter((glyph) => glyph === GLYPH.dot)).toHaveLength(1)
    })

    it('redraws in place when the note is moved', async () => {
      const { view } = await drawn(questionOn(pitch('C', 5)), [writtenOn(pitch('G', 4))])

      await view.setProps({ written: [writtenOn(pitch('A', 4))] })

      await vi.waitFor(() => expect(noteStepAboveBottomLine(view.element as Element)).toBe(3))
      expect(all(view.element as Element, 'svg')).toHaveLength(1)
      expect(all(view.element as Element, '.vf-notehead')).toHaveLength(1)
    })

    // The touch finds its step with stepAt over the reported lines, so the two must agree.
    it.each<[Letter, number, number]>([
      ['E', 4, 0],
      ['G', 4, 2],
      ['C', 5, 5],
      ['F', 5, 8],
    ])(
      'reports the lines so that the height of %s%i reads as step %i',
      async (letter, octave, step) => {
        const { layout } = await drawn(questionOn(pitch('C', 5)), [
          writtenOn(pitch(letter, octave)),
        ])

        const [note] = layout.notes
        const [line] = layout.lines
        if (!note || !line) throw new Error('nothing reported')
        expect(stepAt(note.y, line)).toBe(step)
      },
    )
  })

  // Criterion 6: 1.5 times as large, so at the same width of the container 1.5 times as tall.
  it('draws the staff 1.5 times as large as in Read notes', async () => {
    const question = questionOn(pitch('G', 4))
    const reading = aspectOf((await drawn(question)).root)
    wrapper?.unmount()

    const writing = aspectOf((await drawn(question, [null])).root)

    expect(writing).toBeCloseTo(reading * 1.5, 5)
  })

  it('keeps the drawing as wide as its container', async () => {
    const { root } = await drawn(questionOn(pitch('G', 4)), [writtenOn(pitch('G', 4))])

    expect(root.querySelector('svg')?.getAttribute('width')).toBe('100%')
  })
})

const note = (letter: Letter, octave: number, value: Duration['value']): NoteOrRest => ({
  pitch: pitch(letter, octave),
  duration: { value },
})
const rest = (value: Duration['value']): NoteOrRest => ({ duration: { value } })

describe('StaffView in Write notes with rests and several notes', () => {
  // C4 half, a quarter rest, E4 quarter.
  const WITH_REST = () =>
    createQuestionOf({ beats: 4, beatValue: 4 }, [
      note('C', 4, 'half'),
      rest('quarter'),
      note('E', 4, 'quarter'),
    ])

  it('draws the rests of the question before any note is written', async () => {
    const { root } = await drawn(WITH_REST(), [null, null])

    // VexFlow draws a rest as a stave note whose head is the rest glyph.
    expect(glyphs(root, '.vf-stavenote')).toEqual([GLYPH.restQuarter])
  })

  it('reports the places of the notes alone, the rest apart, in their order', async () => {
    const { layout } = await drawn(WITH_REST(), [null, writtenOn(pitch('E', 4))])

    expect(layout.notes).toHaveLength(2)
    expect(layout.rests).toHaveLength(1)
    const [first, second] = layout.notes
    const [between] = layout.rests
    expect(first?.x).toBeLessThan(between?.x ?? 0)
    expect(between?.x).toBeLessThan(second?.x ?? 0)
  })

  it('draws each written note in the place of its own note, the rest after it', async () => {
    const { root } = await drawn(WITH_REST(), [writtenOn(pitch('G', 4), { value: 'half' }), null])

    expect(glyphs(root, '.vf-notehead')).toEqual([GLYPH.noteheadHalf, GLYPH.restQuarter])
    expect(noteStepAboveBottomLine(root)).toBe(2)
  })

  // Two bars of 4/4 in eighths: sixteen notes, more than a line holds on a phone.
  it('goes on to further lines on a narrow element, as in Read notes', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(328)
    const eighths = Array.from({ length: 16 }, () => note('G', 4, 'eighth'))
    const question = createQuestionOf({ beats: 4, beatValue: 4 }, eighths)

    const reading = await drawn(question)
    const readingLines = reading.layout.lines.length
    wrapper?.unmount()
    const { layout } = await drawn(
      question,
      eighths.map(() => null),
    )

    expect(layout.notes).toHaveLength(16)
    expect(layout.lines.length).toBeGreaterThan(1)
    expect(layout.lines.length).toBeGreaterThanOrEqual(readingLines)
    expect(layout.notes[0]?.line).toBe(0)
    expect(layout.notes.at(-1)?.line).toBe(layout.lines.length - 1)
  })
})
