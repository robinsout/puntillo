import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { StaffView } from '@/infrastructure/notation'
import { COMMON_TIME, createQuestionOf, type Question } from '@/domain/question'

// Feature design-system, slice 5, criterion 16: a line of Most mistakes shows its note on a small
// staff with the clef only: the time signature would say nothing of one note out of its bar.
// Without hideTimeSignature the staff draws it as before.

const C4_WHOLE: Question = createQuestionOf(COMMON_TIME, [
  { pitch: { letter: 'C', octave: 4 }, duration: { value: 'whole' } },
])

const F_SHARP_4_QUARTER: Question = createQuestionOf(COMMON_TIME, [
  {
    pitch: { letter: 'F', octave: 4, alteration: 1 },
    duration: { value: 'quarter' },
    accidental: 'sharp',
  },
])

// The SMuFL glyph of the sharp, as VexFlow draws it.
const SHARP = '\uE262'

let wrapper: VueWrapper | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
})

async function drawn(question: Question, hideTimeSignature?: boolean) {
  wrapper = mount(StaffView, {
    props: { question, label: 'Music staff', hideTimeSignature },
    attachTo: document.body,
  })
  const view = wrapper
  await vi.waitFor(() => expect(view.emitted('drawn')).toBeDefined())
  return view.element as Element
}

const count = (root: Element, selector: string) => root.querySelectorAll(selector).length

describe('StaffView without the time signature', () => {
  it('draws the clef and the note, and no time signature', async () => {
    const root = await drawn(C4_WHOLE, true)

    expect(count(root, '.vf-clef')).toBe(1)
    expect(count(root, '.vf-stavenote')).toBe(1)
    expect(count(root, '.vf-timesignature')).toBe(0)
  })

  it('keeps the sign of the note', async () => {
    const root = await drawn(F_SHARP_4_QUARTER, true)

    expect(root.querySelector('.vf-stavenote')?.textContent).toContain(SHARP)
    expect(count(root, '.vf-timesignature')).toBe(0)
  })

  it('draws the time signature without hideTimeSignature', async () => {
    const root = await drawn(C4_WHOLE)

    expect(count(root, '.vf-timesignature')).toBe(1)
  })
})
