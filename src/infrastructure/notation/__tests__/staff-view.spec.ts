import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { StaffView } from '@/infrastructure/notation'
import type { Letter } from '@/domain/pitch'
import type { Duration, Question } from '@/domain/question'
import { createQuestion } from '@/domain/question'

// The observable result is VexFlow's SVG: vf-* groups and SMuFL glyphs. A note's height is
// read in half staff spaces above the bottom line. jsdom has no canvas or measureText, so
// glyph widths are zero, but the vertical layout does not depend on them.

const GLYPH = {
  gClef: '',
  timeSig4: '',
  noteheadWhole: '',
  noteheadHalf: '',
  noteheadBlack: '',
  flag8thUp: '',
  flag8thDown: '',
  flag16thUp: '',
  flag16thDown: '',
} as const

const questionOn = (letter: Letter, octave = 4, value: Duration['value'] = 'whole'): Question =>
  createQuestion({ pitch: { letter, octave }, duration: { value } })

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

function render(question: Question, label = 'Music staff') {
  wrapper = mount(StaffView, { props: { question, label }, attachTo: document.body })
  return wrapper
}

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

// E4 → 0, C4 → −2, G4 → 2, C5 → 5.
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

async function rendered(root: Element) {
  await vi.waitFor(() => expect(root.querySelector('.vf-notehead')).not.toBeNull())
}

describe('StaffView', () => {
  it('draws one staff with a treble clef, 4/4 time and one note', async () => {
    const { element } = render(questionOn('C'))
    await rendered(element)

    expect(all(element, 'svg')).toHaveLength(1)
    expect(all(element, '.vf-stave')).toHaveLength(1)
    expect(staffLineYs(element)).toHaveLength(5)
    expect(glyphs(element, '.vf-clef')).toEqual([GLYPH.gClef])
    expect(glyphs(element, '.vf-timesignature')).toEqual([GLYPH.timeSig4, GLYPH.timeSig4])
    expect(all(element, '.vf-stavenote')).toHaveLength(1)
  })

  it('draws the note as a whole note', async () => {
    const { element } = render(questionOn('C'))
    await rendered(element)

    expect(glyphs(element, '.vf-notehead')).toEqual([GLYPH.noteheadWhole])
  })

  it('places C4 one ledger line below the staff', async () => {
    const { element } = render(questionOn('C'))
    await rendered(element)

    expect(noteStepAboveBottomLine(element)).toBe(-2)
  })

  it('places G4 on the second line', async () => {
    const { element } = render(questionOn('G'))
    await rendered(element)

    expect(noteStepAboveBottomLine(element)).toBe(2)
  })

  it('places C5 in the third space', async () => {
    const { element } = render(questionOn('C', 5))
    await rendered(element)

    expect(noteStepAboveBottomLine(element)).toBe(5)
  })

  it('redraws in place when the question changes', async () => {
    const view = render(questionOn('C'))
    await rendered(view.element)

    await view.setProps({ question: questionOn('G') })

    await vi.waitFor(() => expect(noteStepAboveBottomLine(view.element)).toBe(2))
    expect(all(view.element, 'svg')).toHaveLength(1)
    expect(all(view.element, '.vf-stave')).toHaveLength(1)
    expect(all(view.element, '.vf-stavenote')).toHaveLength(1)
  })

  // jsdom has no layout, so the real no-scroll check is in e2e. Here: the drawing scales
  // and does not declare itself wider than 360 px.
  it('renders a scalable drawing that fits a 360 px screen', async () => {
    const { element } = render(questionOn('C'))
    await rendered(element)

    const svg = element.querySelector('svg')
    const viewBox = svg
      ?.getAttribute('viewBox')
      ?.split(/[\s,]+/)
      .map(Number)
    expect(viewBox).toHaveLength(4)
    // A percentage or missing width follows the container; a pixel width must not exceed 360.
    const width = svg?.getAttribute('width') ?? ''
    const fixedPixelWidth = /^[\d.]+(px)?$/.test(width) ? Number.parseFloat(width) : 0
    expect(fixedPixelWidth).toBeLessThanOrEqual(360)

    const rightmost = Math.max(
      ...all(element, '.vf-stave path, .vf-stavebarline rect').map((shape) => {
        const box = shape
          .getAttribute('d')
          ?.match(/[\d.]+/g)
          ?.map(Number) ?? [Number(shape.getAttribute('x')) + Number(shape.getAttribute('width'))]
        return Math.max(...box.filter((_, index) => index % 2 === 0))
      }),
    )
    const [minX = 0, , viewWidth = 0] = viewBox ?? []
    expect(rightmost).toBeLessThanOrEqual(minX + viewWidth)
  })
})

describe('StaffView note durations', () => {
  it.each([
    ['whole', GLYPH.noteheadWhole, 0, 0],
    ['half', GLYPH.noteheadHalf, 1, 0],
    ['quarter', GLYPH.noteheadBlack, 1, 0],
    ['eighth', GLYPH.noteheadBlack, 1, 1],
    ['sixteenth', GLYPH.noteheadBlack, 1, 1],
  ] as const)(
    'draws the %s note with its notehead, stems and flags',
    async (value, head, stems, flags) => {
      const { element } = render(questionOn('C', 4, value))
      await rendered(element)

      expect(glyphs(element, '.vf-notehead')).toEqual([head])
      expect(all(element, '.vf-stem')).toHaveLength(stems)
      expect(all(element, '.vf-flag')).toHaveLength(flags)
    },
  )

  // A single note does not fill a 4/4 bar; the user sees it alone, with no rests after it.
  // Feature difficulty-presets, criterion 6: one flag glyph that carries two hooks.
  it.each([
    ['eighth', GLYPH.flag8thUp],
    ['sixteenth', GLYPH.flag16thUp],
  ] as const)('draws the flag of the %s note', async (value, flag) => {
    const { element } = render(questionOn('C', 4, value))
    await rendered(element)

    expect(glyphs(element, '.vf-flag')).toEqual([flag])
  })

  it.each(['half', 'quarter', 'eighth', 'sixteenth'] as const)(
    'draws the %s note alone in the bar, without rests',
    async (value) => {
      const { element } = render(questionOn('G', 4, value))
      await rendered(element)

      expect(all(element, '.vf-stavenote')).toHaveLength(1)
      expect(all(element, '.vf-notehead')).toHaveLength(1)
    },
  )

  it('places a note of any duration at its pitch', async () => {
    const { element } = render(questionOn('C', 5, 'eighth'))
    await rendered(element)

    expect(noteStepAboveBottomLine(element)).toBe(5)
  })
})

// The stem is drawn from the notehead to its far end.
function stemDirection(root: Element): 'up' | 'down' {
  const [, , from, , to] =
    /^M\s*([\d.-]+)[\s,]+([\d.-]+)\s*L\s*([\d.-]+)[\s,]+([\d.-]+)/.exec(
      root.querySelector('.vf-stem path')?.getAttribute('d') ?? '',
    ) ?? []
  if (from === undefined || to === undefined) throw new Error('stem not rendered')
  return Number(to) < Number(from) ? 'up' : 'down'
}

// Engraving rule: below the middle line the stem goes up, on it and above it goes down.
describe('StaffView stem direction', () => {
  it.each<[Letter, number, 'up' | 'down']>([
    ['A', 3, 'up'],
    ['C', 4, 'up'],
    ['A', 4, 'up'],
    ['B', 4, 'down'],
    ['F', 5, 'down'],
    ['C', 6, 'down'],
  ])('points the stem of %s%i %s', async (letter, octave, direction) => {
    const { element } = render(questionOn(letter, octave, 'quarter'))
    await rendered(element)

    expect(stemDirection(element)).toBe(direction)
  })

  it.each([
    ['A', 4, 'eighth', GLYPH.flag8thUp],
    ['B', 4, 'eighth', GLYPH.flag8thDown],
    ['A', 3, 'sixteenth', GLYPH.flag16thUp],
    ['C', 6, 'sixteenth', GLYPH.flag16thDown],
  ] as const)(
    'hangs the flag of the %s%i %s note on its side',
    async (letter, octave, value, flag) => {
      const { element } = render(questionOn(letter, octave, value))
      await rendered(element)

      expect(glyphs(element, '.vf-flag')).toEqual([flag])
    },
  )
})

// VexFlow draws ledger lines as bare paths in the note group, beside its stem, head and flag.
const ledgerLinesOf = (root: Element) => all(root, '.vf-stavenote > path')

// Feature difficulty-presets, criterion 3: Advanced reaches A3 and C6.
describe('StaffView ledger lines', () => {
  it.each<[Letter, number, number, number]>([
    ['A', 3, -4, 2],
    ['B', 3, -3, 1],
    ['C', 4, -2, 1],
    ['E', 4, 0, 0],
    ['G', 5, 9, 0],
    ['A', 5, 10, 1],
    ['B', 5, 11, 1],
    ['C', 6, 12, 2],
  ])('places %s%i at step %i with %i ledger lines', async (letter, octave, step, lines) => {
    const { element } = render(questionOn(letter, octave, 'quarter'))
    await rendered(element)

    expect(noteStepAboveBottomLine(element)).toBe(step)
    expect(ledgerLinesOf(element)).toHaveLength(lines)
  })
})

function drawnRatio(root: Element): number {
  const [, , width = 0, height = 0] =
    root
      .querySelector('svg')
      ?.getAttribute('viewBox')
      ?.split(/[\s,]+/)
      .map(Number) ?? []
  return width / height
}

// The computed aspect-ratio may read "12 / 5", "12/5" or "2.4".
function reservedRatio(root: Element): number {
  const value = getComputedStyle(root).aspectRatio
  const [width, height = 1] = value.split('/').map((part) => Number.parseFloat(part))
  return Number(width) / height
}

describe('StaffView space before the staff is drawn', () => {
  // jsdom has no layout, so the height cannot be measured. Only an aspect ratio matching the
  // drawing reserves the right height at every width; a fixed min-height would match one width.
  // Hence the computed aspect-ratio is checked, not how it is set.
  it('reserves the drawing height before VexFlow has loaded', async () => {
    const { element } = render(questionOn('C'))
    expect(element.querySelector('svg')).toBeNull()
    const before = reservedRatio(element)

    await rendered(element)

    expect(before).toBeCloseTo(drawnRatio(element), 3)
  })

  it('keeps the same reserved height after drawing', async () => {
    const view = render(questionOn('C'))
    const root = view.element
    const before = reservedRatio(root)

    await rendered(root)

    expect(view.element).toBe(root)
    expect(before).toBeGreaterThan(0)
    expect(reservedRatio(view.element)).toBe(before)
  })
})

// The project has no accessibility-tree library, and these two sources suffice for role="img".
function accessibleName(element: Element): string {
  const labelledBy = element.getAttribute('aria-labelledby')
  if (labelledBy) {
    return labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')
      .trim()
  }
  return element.getAttribute('aria-label')?.trim() ?? ''
}

function images(root: Element): Element[] {
  return [root, ...all(root, '*')].filter((node) => node.getAttribute('role') === 'img')
}

describe('StaffView for screen readers', () => {
  it('is one image named by the label it is given', async () => {
    const { element } = render(questionOn('C'), 'Music staff')
    await rendered(element)

    const found = images(element)
    expect(found).toHaveLength(1)
    expect(found.map(accessibleName)).toEqual(['Music staff'])
  })

  it('does not reveal the note in the image name', async () => {
    const { element } = render(questionOn('G'), 'Music staff')
    await rendered(element)

    const [image] = images(element)
    expect(image).toBeDefined()
    const name = accessibleName(image as Element)
    expect(name).toBe('Music staff')
    expect(name).not.toMatch(/\bG\b|G4|\bsol\b/i)
  })

  it('is named before the staff is drawn', () => {
    const { element } = render(questionOn('C'), 'Music staff')

    expect(element.querySelector('svg')).toBeNull()
    expect(images(element).map(accessibleName)).toEqual(['Music staff'])
  })

  it('hides the drawn glyphs from screen readers', async () => {
    const { element } = render(questionOn('C'))
    await rendered(element)

    expect(element.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
  })
})

// The session times an answer from the moment the note is on the staff, so the adapter
// reports each finished drawing; loading time must not count.
describe('StaffView reporting a drawn note', () => {
  // Records whether the note was already in the SVG when "drawn" came.
  function renderWatchingDrawn(question: Question) {
    const drawnWith: (number | null)[] = []
    wrapper = mount(StaffView, {
      props: {
        question,
        label: 'Music staff',
        onDrawn: () => {
          const root = wrapper?.element
          drawnWith.push(
            root?.querySelector('.vf-stavenote') ? noteStepAboveBottomLine(root) : null,
          )
        },
      },
      attachTo: document.body,
    })
    return { view: wrapper, drawnWith }
  }

  async function settled() {
    for (let tick = 0; tick < 5; tick += 1) await flushPromises()
  }

  it('does not report before the note is drawn', () => {
    const view = render(questionOn('C'))

    expect(view.element.querySelector('svg')).toBeNull()
    expect(view.emitted('drawn')).toBeUndefined()
  })

  it('reports once, with no payload, after the note is drawn', async () => {
    const { view, drawnWith } = renderWatchingDrawn(questionOn('C'))

    await vi.waitFor(() => expect(view.emitted('drawn')).toBeDefined())
    await settled()

    expect(view.emitted('drawn')).toEqual([[]])
    expect(drawnWith).toEqual([-2])
  })

  it('reports again after the next question is drawn', async () => {
    const { view, drawnWith } = renderWatchingDrawn(questionOn('C'))
    await vi.waitFor(() => expect(view.emitted('drawn')).toHaveLength(1))

    await view.setProps({ question: questionOn('G') })

    await vi.waitFor(() => expect(view.emitted('drawn')).toHaveLength(2))
    await settled()
    expect(view.emitted('drawn')).toHaveLength(2)
    expect(drawnWith).toEqual([-2, 2])
  })

  it('reports only the question that is drawn when it changes during loading', async () => {
    const { view, drawnWith } = renderWatchingDrawn(questionOn('C'))

    await view.setProps({ question: questionOn('G') })

    await vi.waitFor(() => expect(view.emitted('drawn')).toBeDefined())
    await settled()
    expect(drawnWith).toEqual([2])
  })
})

describe('notation module', () => {
  it('exposes only the staff component', async () => {
    expect(Object.keys(await import('@/infrastructure/notation'))).toEqual(['StaffView'])
  })
})
