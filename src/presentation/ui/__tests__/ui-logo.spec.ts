import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/vue'
import { UiLogo } from '@/presentation/ui'

// Feature header-logo, slice 1, criteria 1, 3 and 4: the sign of the app, the note with its dot on
// the accent square of the favicon, drawn inline in the colours of the tokens. It stands beside
// the name Puntillo, so it is hidden from screen readers.

afterEach(cleanup)

const svgOfLogo = () => {
  const { container } = render(UiLogo)
  const svg = container.querySelector('svg')
  if (!svg) throw new Error('the logo is no SVG')
  return svg
}

const SHAPES = 'rect, ellipse, circle, path, line, polygon, polyline'

describe('UiLogo', () => {
  it('is an inline SVG hidden from screen readers', () => {
    const svg = svgOfLogo()

    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('role')).toBeNull()
  })

  it('draws the shapes of the favicon: the square, the head, the stem and the dot', () => {
    const svg = svgOfLogo()

    expect([...svg.querySelectorAll(SHAPES)].map((shape) => shape.tagName)).toEqual([
      'rect',
      'ellipse',
      'rect',
      'circle',
    ])
  })

  it('draws the square in the accent and the note on it in the surface', () => {
    const [square, ...note] = [...svgOfLogo().querySelectorAll(SHAPES)]

    expect(square?.getAttribute('fill')).toContain('var(--color-accent)')
    expect(note).toHaveLength(3)
    for (const shape of note) expect(shape.getAttribute('fill')).toContain('var(--color-surface)')
  })

  it('has no colour of its own outside the tokens', () => {
    const markup = svgOfLogo().outerHTML

    expect(markup).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(markup).not.toMatch(/\brgba?\(|\bhsla?\(/i)
  })
})
