import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { cleanup, fireEvent, render, screen } from '@testing-library/vue'
import UiAnswerKey from '@/presentation/ui/UiAnswerKey.vue'

// Feature design-system, slice 2, criteria 3 and 8: the key of an answer, as a note name, a sign
// or a duration is. A toggle button named by its content; it is pressed, and after a check marked
// correct, wrong or rejected on the first attempt. The mark is given as data-mark, for the styles
// and for the tests, and rests on shape too: the correct key carries a check hidden from screen
// readers, so its name stays the content alone. Other attributes go to the button.

afterEach(cleanup)

type Mark = 'correct' | 'wrong' | 'rejected' | null

interface Key {
  pressed?: boolean
  mark?: Mark
  disabled?: boolean
  attrs?: Record<string, string>
}

const NAME = 'sol'

function renderKey({ pressed = false, mark = null, disabled = false, attrs = {} }: Key = {}) {
  let presses = 0
  const Host = defineComponent({
    setup: () => () =>
      h(
        'div',
        h(
          UiAnswerKey,
          { pressed, mark, disabled, ...attrs, onClick: () => (presses += 1) },
          { default: () => NAME },
        ),
      ),
  })
  render(Host)
  return { presses: () => presses }
}

const key = () => screen.getByRole<HTMLButtonElement>('button', { name: NAME })
const hiddenMarks = () => key().querySelectorAll('[aria-hidden="true"]')

describe('UiAnswerKey', () => {
  it('is a button of type button named by its content', () => {
    renderKey()

    expect(key().type).toBe('button')
  })

  it.each([true, false])('tells a screen reader it is pressed: %s', (pressed) => {
    renderKey({ pressed })

    expect(key().getAttribute('aria-pressed')).toBe(String(pressed))
  })

  it('carries no mark unless given one', () => {
    renderKey()

    expect(key().hasAttribute('data-mark')).toBe(false)
  })

  it.each(['correct', 'wrong', 'rejected'] as const)('carries the mark %s', (mark) => {
    renderKey({ mark, disabled: mark !== 'wrong' })

    expect(key().getAttribute('data-mark')).toBe(mark)
  })

  it.each(['correct', 'wrong', 'rejected', null] as const)(
    'keeps its content as its only name with the mark %s',
    (mark) => {
      renderKey({ mark })

      expect(screen.getByRole('button', { name: NAME })).toBe(key())
    },
  )

  it('shows a check, hidden from screen readers, when correct', () => {
    renderKey({ mark: 'correct', disabled: true })

    expect(hiddenMarks().length).toBeGreaterThan(0)
  })

  it.each(['wrong', 'rejected', null] as const)('shows no check with the mark %s', (mark) => {
    renderKey({ mark })

    expect(hiddenMarks()).toHaveLength(0)
  })

  it('tells of a press', async () => {
    const { presses } = renderKey()

    await fireEvent.click(key())

    expect(presses()).toBe(1)
  })

  it('cannot be pressed when disabled', async () => {
    const { presses } = renderKey({ disabled: true })

    expect(key().disabled).toBe(true)
    await fireEvent.click(key())
    expect(presses()).toBe(0)
  })

  it('stays pressed while disabled', () => {
    renderKey({ pressed: true, disabled: true })

    expect(key().getAttribute('aria-pressed')).toBe('true')
  })

  it('passes its other attributes to the button', () => {
    renderKey({
      attrs: {
        'aria-describedby': 'mark',
        'aria-keyshortcuts': 'G',
        lang: 'it',
        'data-letter': 'G',
      },
    })

    expect(key().getAttribute('aria-describedby')).toBe('mark')
    expect(key().getAttribute('aria-keyshortcuts')).toBe('G')
    expect(key().getAttribute('lang')).toBe('it')
    expect(key().getAttribute('data-letter')).toBe('G')
  })

  // A sign is drawn as ♯ and named Sharp.
  it('takes its name from aria-label when given one', () => {
    const Host = defineComponent({
      setup: () => () =>
        h(UiAnswerKey, { pressed: false, mark: null, 'aria-label': 'Sharp' }, () => '♯'),
    })
    render(Host)

    expect(screen.getByRole('button', { name: 'Sharp' })).toBeTruthy()
  })
})
