import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/vue'
import UiOptionGrid from '@/presentation/ui/UiOptionGrid.vue'

// Feature navigation-and-settings, slice 3: one of a few options chosen in a grid, as the session
// length is. Native radio buttons of one name, so the arrows move the choice within the group and
// Tab goes in and out of it (edge case 7); the whole cell is the label. An option may show
// something other than its name, as No limit shows ∞.

afterEach(cleanup)

const LABEL = 'Session length'
type Length = 10 | 20 | 'unlimited'
const OPTIONS: readonly { value: Length; label: string; display?: string }[] = [
  { value: 10, label: '10' },
  { value: 20, label: '20' },
  { value: 'unlimited', label: 'No limit', display: '∞' },
]

function renderGrid(initial: Length, props: Record<string, unknown> = {}) {
  const value = ref<Length>(initial)
  const Host = defineComponent({
    setup: () => () =>
      h(UiOptionGrid, {
        label: LABEL,
        name: 'length',
        options: OPTIONS,
        modelValue: value.value,
        // A generic component rendered by h() takes its value as unknown.
        'onUpdate:modelValue': (chosen: unknown) => {
          value.value = chosen as Length
        },
        ...props,
      }),
  })
  render(Host)
  return value
}

const group = () => screen.getByRole('radiogroup', { name: LABEL })
const options = () => within(group()).getAllByRole<HTMLInputElement>('radio')
const option = (name: string) => within(group()).getByRole<HTMLInputElement>('radio', { name })
const checkedCount = () => options().filter((radio) => radio.checked).length

describe('UiOptionGrid', () => {
  it('is a group of radio buttons named by its label', () => {
    renderGrid(10)

    expect(group()).toBeTruthy()
  })

  it('offers the options by their names, in their order', () => {
    renderGrid(10)

    expect(options()).toHaveLength(3)
    expect(option('10')).toBe(options()[0])
    expect(option('20')).toBe(options()[1])
    expect(option('No limit')).toBe(options()[2])
  })

  it('shows what an option displays, named still by its label', () => {
    renderGrid(10)

    expect(screen.getByText('∞')).toBeTruthy()
    expect(screen.queryByText('No limit')).toBeNull()
  })

  it('gives all the options one name, so that they are one group for the browser', () => {
    renderGrid(10)

    expect(new Set(options().map((radio) => radio.name))).toEqual(new Set(['length']))
  })

  it.each([
    [10, '10'],
    [20, '20'],
    ['unlimited', 'No limit'],
  ] as const)('shows the value %j as chosen, and that one only', (value, name) => {
    renderGrid(value)

    expect(option(name).checked).toBe(true)
    expect(checkedCount()).toBe(1)
  })

  it('chooses the option pressed', async () => {
    const value = renderGrid(10)

    await fireEvent.click(option('20'))

    expect(value.value).toBe(20)
    expect(option('20').checked).toBe(true)
    expect(option('10').checked).toBe(false)
  })

  it('chooses an option by a press on its cell, the label', async () => {
    const value = renderGrid(10)

    await fireEvent.click(screen.getByText('∞'))

    expect(value.value).toBe('unlimited')
  })

  it('follows a value changed from outside', async () => {
    const value = renderGrid(10)

    value.value = 'unlimited'

    await expect.poll(() => option('No limit').checked).toBe(true)
    expect(checkedCount()).toBe(1)
  })

  it('may hide its label from the eye and keep it for the reader', () => {
    renderGrid(10, { labelHidden: true })

    expect(group()).toBeTruthy()
  })
})
