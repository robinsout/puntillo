import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/vue'
import tokensCss from '@/presentation/ui/tokens.css?raw'
import DesignSystemView from '@/presentation/ui/catalog/DesignSystemView.vue'
import { contrastRatio } from '@/presentation/ui/contrast'
import { AA_LARGE, AA_NORMAL, TOKEN_PAIRS } from '@/presentation/ui/token-pairs'
import { readTokens } from '@/presentation/ui/tokens'

// Feature design-system, slice 1, criteria 5 and 7: the catalog shows every token with its value
// and the contrast of every pair of tokens used together. The catalog is a tool for developers, so
// its texts are English only.

afterEach(cleanup)

const tokens = readTokens(tokensCss)
const contrastTable = () => within(screen.getByRole('table'))
const textOf = (element: HTMLElement) => element.textContent?.replace(/\s+/g, ' ').trim()
// The names in a cell may be marked up as code, so the cell is matched by its whole text.
const pairCells = () =>
  [
    ...contrastTable().queryAllByRole('rowheader'),
    ...contrastTable().queryAllByRole('cell'),
  ].filter((cell) => /^--color-[\w-]+ on --color-[\w-]+$/.test(textOf(cell) ?? ''))
const rowOf = (foreground: string, background: string) => {
  const row = pairCells()
    .find((cell) => textOf(cell) === `${foreground} on ${background}`)
    ?.closest('tr')
  expect(row, `${foreground} on ${background}`).toBeInstanceOf(HTMLTableRowElement)
  return within(row as HTMLTableRowElement)
}

describe('the catalog of the design system', () => {
  it('is headed Design system with its sections', () => {
    render(DesignSystemView)

    expect(screen.getByRole('heading', { level: 1, name: 'Design system' })).toBeDefined()
    for (const name of ['Colors', 'Contrast', 'Type', 'Spacing', 'Radii', 'Lines']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeDefined()
    }
  })

  it.each([...tokens.entries()])('shows %s with its value %s', (name, value) => {
    render(DesignSystemView)

    expect(screen.getAllByText(name).length).toBeGreaterThan(0)
    expect(screen.getAllByText(value).length).toBeGreaterThan(0)
  })

  it('has a row of contrast for each pair of tokens', () => {
    render(DesignSystemView)

    expect(pairCells()).toHaveLength(TOKEN_PAIRS.length)
  })

  it.each(TOKEN_PAIRS)(
    'shows the ratio of $foreground on $background and that it passes',
    ({ foreground, background, large }) => {
      render(DesignSystemView)
      const ratio = contrastRatio(tokens.get(foreground) ?? '', tokens.get(background) ?? '')
      const row = rowOf(foreground, background)

      expect(row.getByText(`${ratio.toFixed(1)}:1`)).toBeDefined()
      expect(row.getByText(ratio >= (large ? AA_LARGE : AA_NORMAL) ? 'AA' : 'fails')).toBeDefined()
    },
  )
})
