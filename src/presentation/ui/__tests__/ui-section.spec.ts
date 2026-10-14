import { afterEach, describe, expect, it } from 'vitest'
import { h } from 'vue'
import { cleanup, render, screen } from '@testing-library/vue'
import UiSection from '@/presentation/ui/UiSection.vue'

// Feature navigation-and-settings, slice 1: a group of settings of the design system, a section
// headed by its title, so a screen reader moves from group to group by headings.

afterEach(cleanup)

function renderSection() {
  render(UiSection, {
    props: { title: 'Write notes' },
    slots: {
      default: () => [
        h('label', [h('input', { type: 'checkbox' }), 'Show note names on the staff']),
      ],
    },
  })
}

describe('UiSection', () => {
  it('is headed by its title, a heading of the second level', () => {
    renderSection()

    expect(screen.getByRole('heading', { level: 2, name: 'Write notes' })).toBeTruthy()
  })

  it('holds its content in its section, after the heading', () => {
    renderSection()

    const heading = screen.getByRole('heading', { level: 2, name: 'Write notes' })
    const box = screen.getByRole('checkbox', { name: 'Show note names on the staff' })
    const section = heading.closest('section')
    expect(section).not.toBeNull()
    expect(section?.contains(box)).toBe(true)
    expect(heading.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
