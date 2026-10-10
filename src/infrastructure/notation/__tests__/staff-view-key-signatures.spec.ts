import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { StaffView } from '@/infrastructure/notation'
import type { StaffLayout } from '@/infrastructure/notation'
import type { KeySignature } from '@/domain/key-signature'
import type { Letter, Pitch } from '@/domain/pitch'
import { createQuestionOf, type Note, type Question, type TimeSignature } from '@/domain/question'

// Feature accidentals, slice 1, criterion 3 and edge case 2: the key signature of the question
// stands at the start of every line of the staff, right after the clef and before the time
// signature, as Gould's «Behind Bars» and every engraving standard place it. Its signs stand in
// the order and on the places of the treble clef: the sharps on F5 C5 G5 D5 A4 E5 B4, the flats on
// B4 E5 A4 D5 G4 C5 F4. A note altered by the key signature carries no sign of its own: F♯5 in a
// key of one sharp is a plain head on the 5th line.
//
// VexFlow draws the signs as SMuFL glyphs in a group vf-keysignature. jsdom has no layout, so
// glyphs have no width: places across are only compared in a real browser (e2e); places up and
// down hold here. A step is half a staff space above the bottom line: E4 → 0, B4 → 4, F5 → 8.

const SHARP = ''
const FLAT = ''
const G_CLEF = ''

const FOUR_FOUR: TimeSignature = { beats: 4, beatValue: 4 }

const LETTERS: Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B']

type Count = Exclude<KeySignature['count'], 0>
const sharps = (count: Count): KeySignature => ({ count, accidental: 'sharp' })
const flats = (count: Count): KeySignature => ({ count, accidental: 'flat' })

const SHARP_STEPS = [8, 5, 9, 6, 3, 7, 4]
const FLAT_STEPS = [4, 7, 3, 6, 2, 5, 1]

const note = (pitch: Pitch, value: Note['duration']['value'] = 'quarter'): Note => ({
  pitch,
  duration: { value },
})

// Eighths rising from C4 and falling back, each as the key signature makes it.
function eighths(count: number, keySignature: KeySignature): Question {
  const altered = (letter: Letter): Pitch['alteration'] => {
    if (keySignature.count === 0) return undefined
    const order =
      keySignature.accidental === 'sharp'
        ? ['F', 'C', 'G', 'D', 'A', 'E', 'B']
        : ['B', 'E', 'A', 'D', 'G', 'C', 'F']
    if (!order.slice(0, keySignature.count).includes(letter)) return undefined
    return keySignature.accidental === 'sharp' ? 1 : -1
  }
  const notes = Array.from({ length: count }, (_, index) => {
    const letter = LETTERS[index % LETTERS.length] ?? 'C'
    const alteration = altered(letter)
    const pitch: Pitch =
      alteration === undefined ? { letter, octave: 4 } : { letter, octave: 4, alteration }
    return note(pitch, 'eighth')
  })
  return createQuestionOf(FOUR_FOUR, notes, keySignature)
}

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

const glyphsOf = (root: Element, selector: string): Glyph[] =>
  all(root, `${selector} text`).map((text) => ({
    glyph: text.textContent ?? '',
    x: Number(text.getAttribute('x')),
    y: Number(text.getAttribute('y')),
  }))

const staffLineYs = (root: Element): number[] =>
  all(root, '.vf-stave path')
    .map((path) => /^M\s*[\d.-]+[\s,]+([\d.-]+)/.exec(path.getAttribute('d') ?? '')?.[1])
    .filter((y): y is string => y !== undefined)
    .map(Number)
    .sort((a, b) => a - b)

async function drawn(question: Question) {
  wrapper = mount(StaffView, { props: { question, label: 'Music staff' }, attachTo: document.body })
  const view = wrapper
  await vi.waitFor(() => expect(view.emitted('drawn')).toBeDefined())
  const root = view.element
  const layout = reported(view)
  const height = Number(
    root
      .querySelector('svg')
      ?.getAttribute('viewBox')
      ?.split(/[\s,]+/)[3],
  )
  const lineYs = staffLineYs(root)
  // The glyphs of a line of the staff are those within its band of the drawing's height.
  const onLine = (glyphs: Glyph[], line: number) => {
    const band = layout.lines[line]
    if (!band) throw new Error(`no line ${line + 1}`)
    return glyphs.filter(({ y }) => y >= band.top * height && y <= band.bottom * height)
  }
  // Steps above the bottom line of the staff line the glyph is on.
  const stepOf = (glyph: Glyph, line: number) => {
    const band = layout.lines[line]
    const ys = lineYs.filter((y) => band && y >= band.top * height && y <= band.bottom * height)
    const [top, second] = ys
    const bottom = ys.at(-1)
    if (top === undefined || second === undefined || bottom === undefined)
      throw new Error(`no staff on line ${line + 1}`)
    return Math.round((bottom - glyph.y) / ((second - top) / 2))
  }
  return {
    root,
    layout,
    keySignature: glyphsOf(root, '.vf-keysignature'),
    clefs: glyphsOf(root, '.vf-clef'),
    timeSignature: glyphsOf(root, '.vf-timesignature'),
    onLine,
    stepOf,
  }
}

describe('StaffView without key signatures', () => {
  it('draws no key signature', async () => {
    const { root } = await drawn(createQuestionOf(FOUR_FOUR, [note({ letter: 'F', octave: 5 })]))

    expect(all(root, '.vf-keysignature')).toHaveLength(0)
  })
})

describe('StaffView with a key signature', () => {
  // One line of the staff, whatever the number of signs.
  beforeEach(() => widthOfElements(1000))

  it.each([1, 2, 3, 4, 5, 6, 7] as const)('draws %i sharps', async (count) => {
    const { keySignature } = await drawn(eighths(4, sharps(count)))

    expect(keySignature.map(({ glyph }) => glyph)).toEqual(Array(count).fill(SHARP))
  })

  it.each([1, 2, 3, 4, 5, 6, 7] as const)('draws %i flats', async (count) => {
    const { keySignature } = await drawn(eighths(4, flats(count)))

    expect(keySignature.map(({ glyph }) => glyph)).toEqual(Array(count).fill(FLAT))
  })

  it('places the seven sharps on F5 C5 G5 D5 A4 E5 B4', async () => {
    const { keySignature, stepOf } = await drawn(eighths(4, sharps(7)))

    expect(keySignature.map((glyph) => stepOf(glyph, 0))).toEqual(SHARP_STEPS)
  })

  it('places the seven flats on B4 E5 A4 D5 G4 C5 F4', async () => {
    const { keySignature, stepOf } = await drawn(eighths(4, flats(7)))

    expect(keySignature.map((glyph) => stepOf(glyph, 0))).toEqual(FLAT_STEPS)
  })

  it('places fewer signs on the first places of the order', async () => {
    const two = await drawn(eighths(4, sharps(2)))
    expect(two.keySignature.map((glyph) => two.stepOf(glyph, 0))).toEqual(SHARP_STEPS.slice(0, 2))
    wrapper?.unmount()

    const three = await drawn(eighths(4, flats(3)))
    expect(three.keySignature.map((glyph) => three.stepOf(glyph, 0))).toEqual(
      FLAT_STEPS.slice(0, 3),
    )
  })

  it('draws the signs left to right, between the clef and the time signature', async () => {
    const { keySignature, clefs, timeSignature } = await drawn(eighths(4, sharps(7)))

    keySignature.slice(1).forEach(({ x }, index) => {
      expect(x).toBeGreaterThan(keySignature[index]?.x ?? Infinity)
    })
    expect(keySignature[0]?.x).toBeGreaterThanOrEqual(clefs[0]?.x ?? Infinity)
    expect(timeSignature[0]?.x).toBeGreaterThan(keySignature.at(-1)?.x ?? Infinity)
  })

  // Criterion 8: F♯5 in a key of one sharp is the note on the 5th line, with no sign of its own.
  it('draws a note altered by the key signature as a plain head on its place', async () => {
    const { root, stepOf } = await drawn(
      createQuestionOf(FOUR_FOUR, [note({ letter: 'F', octave: 5, alteration: 1 })], sharps(1)),
    )

    const heads = glyphsOf(root, '.vf-notehead')
    expect(heads).toHaveLength(1)
    expect(stepOf(heads[0] as Glyph, 0)).toBe(8)
    const signsAtNotes = glyphsOf(root, '.vf-stavenote').filter(
      ({ glyph }) => glyph === SHARP || glyph === FLAT,
    )
    expect(signsAtNotes).toEqual([])
  })

  it('draws B♭4 in a key of two flats on the middle line, with no sign of its own', async () => {
    const { root, stepOf } = await drawn(
      createQuestionOf(FOUR_FOUR, [note({ letter: 'B', octave: 4, alteration: -1 })], flats(2)),
    )

    expect(stepOf(glyphsOf(root, '.vf-notehead')[0] as Glyph, 0)).toBe(4)
    expect(all(root, '.vf-stavenote text').map((text) => text.textContent)).not.toContain(FLAT)
  })
})

// Edge case 2: on a narrow screen every line of the staff starts with the clef and the key
// signature; the time signature stands once, on the first line. Each note keeps 44 px from its
// neighbours, and the place where the notes may start is right of the signs.
describe('StaffView with a key signature on a narrow element', () => {
  it('starts every line with the clef and the whole key signature', async () => {
    widthOfElements(328)
    const { layout, keySignature, clefs, onLine } = await drawn(eighths(16, sharps(7)))

    expect(layout.lines.length).toBeGreaterThan(1)
    expect(clefs.map(({ glyph }) => glyph)).toEqual(Array(layout.lines.length).fill(G_CLEF))
    expect(keySignature).toHaveLength(7 * layout.lines.length)
    layout.lines.forEach((_, line) => {
      expect(onLine(keySignature, line).map(({ glyph }) => glyph)).toEqual(Array(7).fill(SHARP))
    })
  })

  it('places the signs alike on every line', async () => {
    widthOfElements(328)
    const { layout, keySignature, onLine, stepOf } = await drawn(eighths(16, flats(7)))

    layout.lines.forEach((_, line) => {
      expect(onLine(keySignature, line).map((glyph) => stepOf(glyph, line))).toEqual(FLAT_STEPS)
    })
  })

  it.each([
    ['seven sharps', sharps(7)],
    ['seven flats', flats(7)],
    ['two sharps', sharps(2)],
  ] as const)(
    'keeps each note at least 44 px from the next on its line with %s',
    async (_, keySignature) => {
      widthOfElements(328)
      const { layout } = await drawn(eighths(16, keySignature))

      expect(layout.notes).toHaveLength(16)
      layout.notes.slice(1).forEach((place, index) => {
        const before = layout.notes[index]
        if (!before || before.line !== place.line) return
        expect(
          (place.x - before.x) * 328,
          `notes ${index + 1} and ${index + 2}`,
        ).toBeGreaterThanOrEqual(44)
      })
    },
  )

  it('takes more lines with seven signs than with none: the signs take room', async () => {
    widthOfElements(328)
    const none = (await drawn(eighths(16, { count: 0 }))).layout.lines.length
    wrapper?.unmount()
    const seven = (await drawn(eighths(16, sharps(7)))).layout.lines.length

    expect(seven).toBeGreaterThan(none)
  })

  it('lets the notes of each line start right of its last sign', async () => {
    widthOfElements(328)
    const { layout, keySignature, onLine } = await drawn(eighths(16, sharps(7)))

    layout.lines.forEach((band, line) => {
      const last = Math.max(...onLine(keySignature, line).map(({ x }) => x))
      expect(band.left * 328, `start of line ${line + 1}`).toBeGreaterThan(last)
    })
    layout.notes.forEach((place, index) => {
      const band = layout.lines[place.line]
      expect(place.x, `note ${index + 1}`).toBeGreaterThan(band?.left ?? Infinity)
    })
  })
})
