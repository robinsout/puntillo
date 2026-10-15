import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { cleanup, fireEvent, render, screen } from '@testing-library/vue'
import UiDisclosure from '@/presentation/ui/UiDisclosure.vue'

// Feature design-system, slice 7, criteria 3 and 11: a group that expands and collapses, as the
// sections Pitch, Rhythm and Signs of Customize are. Its header is a native button as wide as the
// column, named by the title alone, so Enter and Space work as on any button; aria-expanded tells
// its state and aria-controls points at the content, the default slot, which is not rendered while
// collapsed. The chevron beside the title turns with the state, for the eye only; the turn is CSS.

afterEach(cleanup)

const TITLE = 'Rhythm'
const CONTENT = 'Durations'

function renderDisclosure(initial: boolean) {
  const expanded = ref(initial)
  const Host = defineComponent({
    setup: () => () =>
      h(
        UiDisclosure,
        {
          title: TITLE,
          modelValue: expanded.value,
          'onUpdate:modelValue': (value: boolean) => {
            expanded.value = value
          },
        },
        { default: () => h('p', CONTENT) },
      ),
  })
  render(Host)
  return expanded
}

const header = () => screen.getByRole<HTMLButtonElement>('button', { name: TITLE })
const content = () => screen.queryByText(CONTENT)

describe('UiDisclosure', () => {
  it('is a plain button named by its title alone', () => {
    renderDisclosure(false)

    expect(header().tagName).toBe('BUTTON')
    expect(header().type).toBe('button')
  })

  it('is the disclosure of the system', () => {
    renderDisclosure(false)

    expect(header().closest('.ui-disclosure')).not.toBeNull()
  })

  it('shows a chevron in its header for the eye only', () => {
    renderDisclosure(false)

    expect(header().querySelector('svg[aria-hidden="true"]')).not.toBeNull()
  })

  it('collapsed, tells so and hides its content', () => {
    renderDisclosure(false)

    expect(header().getAttribute('aria-expanded')).toBe('false')
    expect(content()).toBeNull()
  })

  it('expanded, tells so and shows its content, which its header controls', () => {
    renderDisclosure(true)

    expect(header().getAttribute('aria-expanded')).toBe('true')
    const shown = content()
    expect(shown).not.toBeNull()
    const controlled = document.getElementById(header().getAttribute('aria-controls') ?? '')
    expect(controlled?.contains(shown)).toBe(true)
  })

  it('expands on a press, then collapses on another', async () => {
    const expanded = renderDisclosure(false)

    await fireEvent.click(header())

    expect(expanded.value).toBe(true)
    expect(header().getAttribute('aria-expanded')).toBe('true')
    expect(content()).not.toBeNull()

    await fireEvent.click(header())

    expect(expanded.value).toBe(false)
    expect(content()).toBeNull()
  })

  it('follows a value changed from outside', async () => {
    const expanded = renderDisclosure(false)

    expanded.value = true

    await expect.poll(() => header().getAttribute('aria-expanded')).toBe('true')
    expect(content()).not.toBeNull()
  })
})
