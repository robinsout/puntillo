import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { cleanup, fireEvent, render, screen } from '@testing-library/vue'
import UiButton from '@/presentation/ui/UiButton.vue'

// Feature navigation-and-settings, slice 3: the button of the design system, as Start is. Its
// content is the slot; a button of a form is of type button unless given, so that it never sends
// one.

afterEach(cleanup)

function renderButton(props: Record<string, unknown> = {}) {
  let presses = 0
  const Host = defineComponent({
    setup: () => () =>
      h('form', { onSubmit: (event: Event) => event.preventDefault() }, [
        h(UiButton, { ...props, onClick: () => (presses += 1) }, { default: () => 'Start' }),
      ]),
  })
  render(Host)
  return { presses: () => presses }
}

const button = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Start' })

describe('UiButton', () => {
  it('is a button named by its content', () => {
    renderButton()

    expect(button()).toBeTruthy()
  })

  it('is of type button unless given', () => {
    renderButton()

    expect(button().type).toBe('button')
  })

  it('takes the type given', () => {
    renderButton({ type: 'submit' })

    expect(button().type).toBe('submit')
  })

  it('tells of a press', async () => {
    const { presses } = renderButton()

    await fireEvent.click(button())

    expect(presses()).toBe(1)
  })

  it('is enabled unless disabled', () => {
    renderButton()

    expect(button().disabled).toBe(false)
  })

  it('cannot be pressed when disabled', async () => {
    const { presses } = renderButton({ disabled: true })

    expect(button().disabled).toBe(true)
    await fireEvent.click(button())
    expect(presses()).toBe(0)
  })
})
