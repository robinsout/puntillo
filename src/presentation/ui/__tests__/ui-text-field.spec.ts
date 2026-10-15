import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { cleanup, fireEvent, render, screen } from '@testing-library/vue'
import UiTextField from '@/presentation/ui/UiTextField.vue'

// Feature design-system, slice 6: the text field of the design system, as Search of the wiki is.
// Its label stands above the field and names it; the field is of the type given, text unless
// given, so a search field is a searchbox to screen readers.

afterEach(cleanup)

const LABEL = 'Search'

function renderField(props: Record<string, unknown> = {}, initial = '') {
  const value = ref(initial)
  const Host = defineComponent({
    setup: () => () =>
      h(UiTextField, {
        label: LABEL,
        ...props,
        modelValue: value.value,
        'onUpdate:modelValue': (typed: string) => {
          value.value = typed
        },
      }),
  })
  render(Host)
  return value
}

const field = (role: 'textbox' | 'searchbox' = 'textbox') =>
  screen.getByRole<HTMLInputElement>(role, { name: LABEL })

describe('UiTextField', () => {
  it('is a text field named by its label unless given a type', () => {
    renderField()

    expect(field().type).toBe('text')
  })

  it('is a search field when given the type search', () => {
    renderField({ type: 'search' })

    expect(field('searchbox').type).toBe('search')
  })

  it('shows its label, above the field', () => {
    renderField()

    const label = screen.getByText(LABEL)
    expect(screen.getByLabelText(LABEL)).toBe(field())
    expect(label.compareDocumentPosition(field()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows the value given', () => {
    renderField({}, 'sharp')

    expect(field().value).toBe('sharp')
  })

  it('gives back what is typed', async () => {
    const value = renderField()

    await fireEvent.update(field(), 'natural')

    expect(value.value).toBe('natural')
  })

  it('gives back an emptied field', async () => {
    const value = renderField({}, 'sharp')

    await fireEvent.update(field(), '')

    expect(value.value).toBe('')
  })
})
