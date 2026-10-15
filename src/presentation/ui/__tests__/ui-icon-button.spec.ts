import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { cleanup, fireEvent, render, screen } from '@testing-library/vue'
import UiIconButton from '@/presentation/ui/UiIconButton.vue'

// Feature design-system, slice 7, criteria 3 and 9: a round button that shows a sign, as the help
// "?" beside a parameter of Customize does. The sign, its slot, says nothing to a screen reader, so
// the label it must be given is its accessible name. Its size, at least 44 × 44, is CSS, checked in
// e2e/dialogs.spec.ts.

afterEach(cleanup)

const LABEL = 'Help: Ledger lines'

function renderIconButton() {
  // The target is read during the press: an event forgets it once dispatched.
  const presses: (EventTarget | null)[] = []
  const Host = defineComponent({
    setup: () => () =>
      h(
        UiIconButton,
        { label: LABEL, onClick: (event: MouseEvent) => presses.push(event.currentTarget) },
        { default: () => '?' },
      ),
  })
  render(Host)
  return presses
}

const iconButton = () => screen.getByRole<HTMLButtonElement>('button', { name: LABEL })

describe('UiIconButton', () => {
  it('is named by its label, not by the sign it shows', () => {
    renderIconButton()

    expect(iconButton().textContent?.trim()).toBe('?')
    expect(screen.queryByRole('button', { name: '?' })).toBeNull()
  })

  it('is a plain button of type button', () => {
    renderIconButton()

    expect(iconButton().tagName).toBe('BUTTON')
    expect(iconButton().type).toBe('button')
  })

  it('is the round button of the system', () => {
    renderIconButton()

    expect([...iconButton().classList]).toContain('ui-icon-button')
  })

  it('tells of a press with its event, whose target is the button', async () => {
    const presses = renderIconButton()

    await fireEvent.click(iconButton())

    expect(presses).toEqual([iconButton()])
  })
})
