import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { cleanup, fireEvent, render, screen } from '@testing-library/vue'
import UiCheckbox from '@/presentation/ui/UiCheckbox.vue'

// Feature navigation-and-settings, slice 1: the box with its label of the design system. The
// label is its slot; the attributes it does not take itself reach the box, so the box can be
// described by a line beside it and marked as a switch of the sound for App.vue.

afterEach(cleanup)

const LABEL = 'Play the keys'

function renderBox(initial: boolean, attributes: Record<string, unknown> = {}) {
  const value = ref(initial)
  const Host = defineComponent({
    setup: () => () => [
      h(
        UiCheckbox,
        {
          modelValue: value.value,
          'onUpdate:modelValue': (checked: boolean) => {
            value.value = checked
          },
          ...attributes,
        },
        { default: () => LABEL },
      ),
      h('p', { id: 'line' }, 'Connect a MIDI keyboard to this device.'),
    ],
  })
  render(Host)
  return value
}

const box = () => screen.getByRole<HTMLInputElement>('checkbox', { name: LABEL })

describe('UiCheckbox', () => {
  it('is a checkbox named by its label', () => {
    renderBox(false)

    expect(box()).toBeTruthy()
  })

  it.each([true, false])('shows the value %s', (checked) => {
    renderBox(checked)

    expect(box().checked).toBe(checked)
  })

  it('ticks and clears the value when pressed', async () => {
    const value = renderBox(false)

    await fireEvent.click(box())
    expect(value.value).toBe(true)
    expect(box().checked).toBe(true)

    await fireEvent.click(box())
    expect(value.value).toBe(false)
    expect(box().checked).toBe(false)
  })

  it('is ticked by a press on its label too', async () => {
    const value = renderBox(false)

    await fireEvent.click(screen.getByText(LABEL))

    expect(value.value).toBe(true)
  })

  it('cannot be changed when disabled', async () => {
    const value = renderBox(false, { disabled: true })

    expect(box().disabled).toBe(true)
    await fireEvent.click(box())
    expect(value.value).toBe(false)
  })

  it('is enabled unless disabled', () => {
    renderBox(false)

    expect(box().disabled).toBe(false)
  })

  it('is described by the element given in aria-describedby', () => {
    renderBox(false, { 'aria-describedby': 'line' })

    expect(
      screen.getByRole('checkbox', {
        name: LABEL,
        description: 'Connect a MIDI keyboard to this device.',
      }),
    ).toBeTruthy()
  })

  // App.vue looks for the mark from the target of a press, which may be the box or its label.
  it('carries data-sound-switch around the box and its label', () => {
    renderBox(false, { 'data-sound-switch': '' })

    expect(box().closest('[data-sound-switch]')).not.toBeNull()
    expect(screen.getByText(LABEL).closest('[data-sound-switch]')).not.toBeNull()
  })
})
