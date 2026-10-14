import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/vue'
import UiIcon from '@/presentation/ui/UiIcon.vue'

// Feature navigation-and-settings, slice 2: the icon of a section, drawn inline by its name. It
// stands beside a label that names the section, so it is hidden from screen readers.

afterEach(cleanup)

const NAMES = ['trainer', 'progress', 'wiki', 'settings'] as const

const svgOf = (name: (typeof NAMES)[number]) => {
  const { container } = render(UiIcon, { props: { name } })
  const svg = container.querySelector('svg')
  if (!svg) throw new Error(`the icon ${name} is no SVG`)
  return svg
}

describe('UiIcon', () => {
  it.each(NAMES)('draws %s as an inline SVG hidden from screen readers', (name) => {
    const svg = svgOf(name)

    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.querySelector('path, line, rect, circle, polyline, ellipse')).not.toBeNull()
  })

  // The colour of the text around it, so a current section draws its icon in the accent too.
  it.each(NAMES)('draws %s in outline, in the colour of the text', (name) => {
    const svg = svgOf(name)

    expect(svg.getAttribute('stroke')).toBe('currentColor')
    expect(svg.getAttribute('fill')).toBe('none')
  })

  it('draws each name differently', () => {
    const drawings = NAMES.map((name) => {
      const markup = svgOf(name).innerHTML
      cleanup()
      return markup
    })

    expect(new Set(drawings).size).toBe(NAMES.length)
  })
})
