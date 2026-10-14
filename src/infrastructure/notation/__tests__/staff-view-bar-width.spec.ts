import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { StaffView } from '@/infrastructure/notation'
import type { Letter } from '@/domain/pitch'
import { createQuestionIn, type Duration, type Question } from '@/domain/question'

// Feature design-system, slice 2, criterion 15: on a wide screen a bar is not stretched over the
// whole width. With maxBarWidth, in units of the drawing, a line of the staff is no wider than its
// bars times it, the rest of the width left empty on the right; it is never narrower than its notes
// need. Without it the line spans the width as before.
//
// jsdom has no layout, so the width of the element is stubbed: 1000 px on a wide screen, where a
// unit of the drawing is a pixel. The width of a line is read from the paths of its staff lines.

const FOUR_FOUR = { beats: 4, beatValue: 4 } as const
const LETTERS: Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
const WIDTH = 1000

function questionOf(...values: Duration['value'][]): Question {
  const notes = values.map((value, index) => ({
    pitch: { letter: LETTERS[index % LETTERS.length] ?? 'C', octave: 4 },
    duration: { value },
  }))
  const [first, ...rest] = notes
  if (!first) throw new Error('a question needs a note')
  return createQuestionIn(FOUR_FOUR, first, ...rest)
}

const ONE_BAR = questionOf('whole')
const TWO_BARS = questionOf('whole', 'whole')
const SIXTEEN_EIGHTHS = questionOf(...Array<Duration['value']>(16).fill('eighth'))

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// The x of every point of the paths of the first line of the staff.
function lineXs(root: Element): number[] {
  const stave = root.querySelector('.vf-stave')
  if (!stave) throw new Error('no staff drawn')
  return [...stave.querySelectorAll('path')].flatMap((path) =>
    [...(path.getAttribute('d') ?? '').matchAll(/[ML]\s*(-?[\d.]+)[\s,]+-?[\d.]+/g)].map((match) =>
      Number(match[1]),
    ),
  )
}

async function lineWidth(question: Question, maxBarWidth?: number): Promise<number> {
  vi.stubGlobal('innerWidth', 1440)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(WIDTH)
  wrapper = mount(StaffView, {
    props: {
      question,
      label: 'Music staff',
      ...(maxBarWidth === undefined ? {} : { maxBarWidth }),
    },
    attachTo: document.body,
  })
  const view = wrapper
  await vi.waitFor(() => expect(view.emitted('drawn')).toBeDefined())
  const xs = lineXs(view.element)
  return Math.max(...xs) - Math.min(...xs)
}

describe('StaffView maxBarWidth', () => {
  it('spans the line over nearly the whole width without it', async () => {
    expect(await lineWidth(ONE_BAR)).toBeGreaterThan(WIDTH * 0.9)
  })

  it('keeps a line of one bar to the width given', async () => {
    const width = await lineWidth(ONE_BAR, 480)

    expect(width).toBeLessThanOrEqual(480 + 0.5)
    expect(width).toBeGreaterThan(480 * 0.9)
  })

  it('keeps a line of two bars to twice the width given', async () => {
    const width = await lineWidth(TWO_BARS, 300)

    expect(width).toBeLessThanOrEqual(2 * 300 + 0.5)
    expect(width).toBeGreaterThan(300 + 0.5)
  })

  // Sixteen eighths are two bars of 4/4: far more than two bars of 10 units hold.
  it('never draws a line narrower than its notes need', async () => {
    expect(await lineWidth(SIXTEEN_EIGHTHS, 10)).toBeGreaterThan(16 * 20)
  })

  it('stays within the width of the drawing when the bars would be wider', async () => {
    expect(await lineWidth(TWO_BARS, 2000)).toBeLessThanOrEqual(WIDTH + 0.5)
  })
})
