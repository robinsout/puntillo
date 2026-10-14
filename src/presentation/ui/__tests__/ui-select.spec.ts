import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/vue'
import UiSelect from '@/presentation/ui/UiSelect.vue'

// Feature navigation-and-settings, slice 1: the list with its label of the design system, as
// Language, Note names and Note input are.

afterEach(cleanup)

const LABEL = 'Note input'
const OPTIONS = [
  { value: 'names', label: 'Note names' },
  { value: 'keyboard', label: 'Piano keyboard' },
] as const

function renderList(
  initial: string,
  options: readonly { value: string; label: string; lang?: string }[] = OPTIONS,
) {
  const value = ref(initial)
  const Host = defineComponent({
    setup: () => () =>
      h(UiSelect, {
        label: LABEL,
        options,
        modelValue: value.value,
        'onUpdate:modelValue': (chosen: string) => {
          value.value = chosen
        },
      }),
  })
  render(Host)
  return value
}

const list = () => screen.getByRole<HTMLSelectElement>('combobox', { name: LABEL })
const optionNames = () =>
  within(list())
    .getAllByRole('option')
    .map((option) => option.textContent?.trim())
const chosen = () => list().selectedOptions[0]?.textContent?.trim()

describe('UiSelect', () => {
  it('is a list named by its label', () => {
    renderList('names')

    expect(list()).toBeTruthy()
  })

  it('offers the options by their labels, in their order', () => {
    renderList('names')

    expect(optionNames()).toEqual(['Note names', 'Piano keyboard'])
  })

  it.each([
    ['names', 'Note names'],
    ['keyboard', 'Piano keyboard'],
  ])('shows the value %s as chosen', (value, label) => {
    renderList(value)

    expect(chosen()).toBe(label)
  })

  it('takes the value of the option chosen', async () => {
    const value = renderList('names')
    const option = within(list()).getByRole<HTMLOptionElement>('option', { name: 'Piano keyboard' })

    await fireEvent.update(list(), option.value)

    expect(value.value).toBe('keyboard')
    expect(chosen()).toBe('Piano keyboard')
  })

  // The languages and the namings are named in their own language, which screen readers
  // pronounce by the lang of the option (LanguageChoice, NoteNamingChoice).
  it('marks an option with its language when one is given', () => {
    renderList('en', [
      { value: 'en', label: 'English', lang: 'en' },
      { value: 'ru', label: 'Русский', lang: 'ru' },
    ])

    const langs = within(list())
      .getAllByRole('option')
      .map((option) => option.getAttribute('lang'))
    expect(langs).toEqual(['en', 'ru'])
  })
})
