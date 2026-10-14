import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/vue'
import UiChoiceCard from '@/presentation/ui/UiChoiceCard.vue'

// Feature navigation-and-settings, slice 4: a card to choose one of a few, as a preset is chosen.
// A toggle button named by its title alone, whatever its media shows; the line under the title is
// its description; the chosen card carries a mark that does not rest on colour.

afterEach(cleanup)

const TITLE = 'First steps'
const DESCRIPTION = 'C4–C5 · one note'

function renderCard(props: { pressed: boolean; description?: string }) {
  let presses = 0
  const Host = defineComponent({
    setup: () => () =>
      h(
        UiChoiceCard,
        { title: TITLE, ...props, onClick: () => (presses += 1) },
        { media: () => h('div', { role: 'img', 'aria-label': 'Example' }) },
      ),
  })
  render(Host)
  return { presses: () => presses }
}

const card = () => screen.getByRole<HTMLButtonElement>('button', { name: TITLE })
// The media of the test is no SVG, so an SVG in the card is the mark.
const marks = () => card().querySelectorAll('svg')

describe('UiChoiceCard', () => {
  it('is a button named by its title alone, though its media is labelled', () => {
    renderCard({ pressed: false, description: DESCRIPTION })

    expect(card()).toBeTruthy()
  })

  it('is of type button', () => {
    renderCard({ pressed: false })

    expect(card().type).toBe('button')
  })

  it.each([true, false])('tells a screen reader it is pressed: %s', (pressed) => {
    renderCard({ pressed })

    expect(card().getAttribute('aria-pressed')).toBe(String(pressed))
  })

  it('shows its description and gives it as the description of the button', () => {
    renderCard({ pressed: false, description: DESCRIPTION })

    expect(screen.getByText(DESCRIPTION)).toBeTruthy()
    expect(screen.getByRole('button', { name: TITLE, description: DESCRIPTION })).toBeTruthy()
  })

  it('has no description without one', () => {
    renderCard({ pressed: false })

    expect(screen.getByRole('button', { name: TITLE, description: '' })).toBeTruthy()
  })

  it('shows its media inside', () => {
    renderCard({ pressed: false })

    expect(within(card()).getByRole('img', { name: 'Example' })).toBeTruthy()
  })

  it('tells of a press', async () => {
    const { presses } = renderCard({ pressed: false })

    await fireEvent.click(card())

    expect(presses()).toBe(1)
  })

  it('carries the mark when pressed, hidden from screen readers', () => {
    renderCard({ pressed: true })

    expect(marks()).toHaveLength(1)
    expect(marks()[0]?.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('carries no mark when not pressed', () => {
    renderCard({ pressed: false })

    expect(marks()).toHaveLength(0)
  })
})
