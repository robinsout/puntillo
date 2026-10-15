import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/vue'
import UiSegmented from '@/presentation/ui/UiSegmented.vue'

// Feature navigation-and-settings, slice 4: a switch of a few segments side by side, as Exercise
// is. Native radio buttons of one name, so the arrows move the choice within the group; the group
// is named by its label, which is hidden from the eye; each segment shows its option's name.
//
// Feature design-system, slice 7: an option may be unavailable, as a number of ledger lines with
// too few notes in Customize is. It cannot be chosen, and its reason is shown on its segment as
// small secondary text and read as its description; the name of the option stays its label.

afterEach(cleanup)

const LABEL = 'Exercise'
type Exercise = 'read' | 'write'
type Option = {
  value: Exercise
  label: string
  disabled?: boolean
  description?: string
}
const OPTIONS: readonly Option[] = [
  { value: 'read', label: 'Read notes' },
  { value: 'write', label: 'Write notes' },
]

function renderSegmented(initial: Exercise, options: readonly Option[] = OPTIONS) {
  const value = ref<Exercise>(initial)
  const Host = defineComponent({
    setup: () => () =>
      h(UiSegmented, {
        label: LABEL,
        name: 'exercise',
        options,
        modelValue: value.value,
        // A generic component rendered by h() takes its value as unknown.
        'onUpdate:modelValue': (chosen: unknown) => {
          value.value = chosen as Exercise
        },
      }),
  })
  render(Host)
  return value
}

// Either a fieldset with a legend or an element with role="radiogroup" names the segments.
function group() {
  const found =
    screen.queryByRole('group', { name: LABEL }) ??
    screen.queryByRole('radiogroup', { name: LABEL })
  if (!found) throw new Error(`no group named "${LABEL}"`)
  return found
}
const options = () => within(group()).getAllByRole<HTMLInputElement>('radio')
const option = (name: string) => within(group()).getByRole<HTMLInputElement>('radio', { name })
const checkedCount = () => options().filter((radio) => radio.checked).length

describe('UiSegmented', () => {
  it('is a group of radio buttons named by its label', () => {
    renderSegmented('read')

    expect(group()).toBeTruthy()
  })

  it('hides its label from the eye and keeps it for the reader', () => {
    renderSegmented('read')

    const shown = screen.queryByText(LABEL)
    expect(shown === null || shown.closest('.visually-hidden') !== null).toBe(true)
  })

  it('offers the options by their names, in their order', () => {
    renderSegmented('read')

    expect(options()).toHaveLength(2)
    expect(option('Read notes')).toBe(options()[0])
    expect(option('Write notes')).toBe(options()[1])
  })

  it('shows the name of each option on its segment', () => {
    renderSegmented('read')

    expect(screen.getByText('Read notes')).toBeTruthy()
    expect(screen.getByText('Write notes')).toBeTruthy()
  })

  it('gives all the options one name, so that they are one group for the browser', () => {
    renderSegmented('read')

    expect(new Set(options().map((radio) => radio.name))).toEqual(new Set(['exercise']))
  })

  it.each([
    ['read', 'Read notes'],
    ['write', 'Write notes'],
  ] as const)('shows the value %j as chosen, and that one only', (value, name) => {
    renderSegmented(value)

    expect(option(name).checked).toBe(true)
    expect(checkedCount()).toBe(1)
  })

  it('chooses the option pressed', async () => {
    const value = renderSegmented('read')

    await fireEvent.click(option('Write notes'))

    expect(value.value).toBe('write')
    expect(option('Write notes').checked).toBe(true)
    expect(option('Read notes').checked).toBe(false)
  })

  it('chooses an option by a press on its segment, the label', async () => {
    const value = renderSegmented('read')

    await fireEvent.click(screen.getByText('Write notes'))

    expect(value.value).toBe('write')
  })

  it('follows a value changed from outside', async () => {
    const value = renderSegmented('read')

    value.value = 'write'

    await expect.poll(() => option('Write notes').checked).toBe(true)
    expect(checkedCount()).toBe(1)
  })
})

describe('UiSegmented with an unavailable option', () => {
  const REASON = 'Too few notes'
  const WITH_UNAVAILABLE: readonly Option[] = [
    { value: 'read', label: 'Read notes' },
    { value: 'write', label: 'Write notes', disabled: true, description: REASON },
  ]

  it('cannot be chosen, by itself or by its segment', async () => {
    const value = renderSegmented('read', WITH_UNAVAILABLE)

    expect(option('Write notes').disabled).toBe(true)
    await fireEvent.click(screen.getByText('Write notes'))

    expect(value.value).toBe('read')
    expect(option('Read notes').checked).toBe(true)
  })

  it('shows its reason, read as its description, its name still its label', () => {
    renderSegmented('read', WITH_UNAVAILABLE)

    expect(screen.getByText(REASON)).toBeTruthy()
    expect(within(group()).getByRole('radio', { name: 'Write notes', description: REASON })).toBe(
      option('Write notes'),
    )
  })

  it('leaves the other options available and undescribed', () => {
    renderSegmented('read', WITH_UNAVAILABLE)

    expect(option('Read notes').disabled).toBe(false)
    expect(option('Read notes').hasAttribute('aria-describedby')).toBe(false)
  })
})
