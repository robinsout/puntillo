import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import tokensCss from '@/presentation/ui/tokens.css?raw'
import DesignSystemView from '@/presentation/ui/catalog/DesignSystemView.vue'
import { contrastRatio } from '@/presentation/ui/contrast'
import { AA_LARGE, AA_NORMAL, TOKEN_PAIRS } from '@/presentation/ui/token-pairs'
import { readTokens } from '@/presentation/ui/tokens'

// Feature design-system, slice 1, criteria 5 and 7: the catalog shows every token with its value
// and the contrast of every pair of tokens used together. The catalog is a tool for developers, so
// its texts are English only. Feature navigation-and-settings, slice 1: the section Components
// shows each component of the system in its states; slice 2 adds the icons, the header and the
// navigation, whose links need a router; slice 3 the button and the grid of options.

afterEach(cleanup)

function renderCatalog() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:any(.*)*', component: { render: () => null } }],
  })
  render(DesignSystemView, { global: { plugins: [router] } })
}

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
    renderCatalog()

    expect(screen.getByRole('heading', { level: 1, name: 'Design system' })).toBeDefined()
    for (const name of ['Colors', 'Contrast', 'Type', 'Spacing', 'Radii', 'Lines']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeDefined()
    }
  })

  it.each([...tokens.entries()])('shows %s with its value %s', (name, value) => {
    renderCatalog()

    expect(screen.getAllByText(name).length).toBeGreaterThan(0)
    expect(screen.getAllByText(value).length).toBeGreaterThan(0)
  })

  it('has a row of contrast for each pair of tokens', () => {
    renderCatalog()

    expect(pairCells()).toHaveLength(TOKEN_PAIRS.length)
  })

  it.each(TOKEN_PAIRS)(
    'shows the ratio of $foreground on $background and that it passes',
    ({ foreground, background, large }) => {
      renderCatalog()
      const ratio = contrastRatio(tokens.get(foreground) ?? '', tokens.get(background) ?? '')
      const row = rowOf(foreground, background)

      expect(row.getByText(`${ratio.toFixed(1)}:1`)).toBeDefined()
      expect(row.getByText(ratio >= (large ? AA_LARGE : AA_NORMAL) ? 'AA' : 'fails')).toBeDefined()
    },
  )
})

describe('the section Components of the catalog', () => {
  const components = () => within(screen.getByRole('region', { name: 'Components' }))

  it('is a section headed Components', () => {
    renderCatalog()

    expect(screen.getByRole('heading', { level: 2, name: 'Components' })).toBeDefined()
  })

  it.each([
    'UiCheckbox',
    'UiSelect',
    'UiSection',
    'UiIcon',
    'UiAppBar',
    'UiNavBar',
    'UiButton',
    'UiOptionGrid',
  ])('names the component %s', (name) => {
    renderCatalog()

    expect(components().getAllByText(name).length).toBeGreaterThan(0)
  })

  it('shows the box unticked, ticked, disabled and with a description', () => {
    renderCatalog()

    const boxes = components().getAllByRole<HTMLInputElement>('checkbox')
    expect(boxes.some((box) => !box.checked && !box.disabled)).toBe(true)
    expect(boxes.some((box) => box.checked && !box.disabled)).toBe(true)
    expect(boxes.some((box) => box.disabled)).toBe(true)
    expect(boxes.some((box) => box.getAttribute('aria-describedby'))).toBe(true)
  })

  it('shows a list named by its label', () => {
    renderCatalog()

    expect(components().getAllByRole('combobox', { name: /\S/ }).length).toBeGreaterThan(0)
  })

  it('shows a group headed by its title', () => {
    renderCatalog()

    const titles = components()
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent?.trim())
      .filter((title) => title !== 'Components')
    expect(titles.length).toBeGreaterThan(0)
  })

  it('shows the icon of each of the four sections', () => {
    renderCatalog()

    const icons = screen
      .getByRole('region', { name: 'Components' })
      .querySelectorAll('svg[aria-hidden="true"]')
    expect(icons.length).toBeGreaterThanOrEqual(4)
  })

  it('shows a header with its title a link', () => {
    renderCatalog()

    expect(components().getAllByRole('link', { name: 'Puntillo' }).length).toBeGreaterThan(0)
  })

  it('shows a navigation with the current section and ordinary ones', () => {
    renderCatalog()

    const navs = components().getAllByRole('navigation')
    expect(navs.length).toBeGreaterThan(0)
    const links = navs.flatMap((nav) => within(nav).getAllByRole('link'))
    expect(links.some((link) => link.getAttribute('aria-current') === 'page')).toBe(true)
    expect(links.some((link) => link.getAttribute('aria-current') !== 'page')).toBe(true)
  })

  it('shows the button enabled and disabled', () => {
    renderCatalog()

    const buttons = components().getAllByRole<HTMLButtonElement>('button')
    expect(buttons.some((button) => !button.disabled)).toBe(true)
    expect(buttons.some((button) => button.disabled)).toBe(true)
  })

  it('shows a grid of options named by its label, one of them chosen', () => {
    renderCatalog()

    const groups = components().getAllByRole('radiogroup', { name: /\S/ })
    expect(groups.length).toBeGreaterThan(0)
    const radios = groups.flatMap((group) => within(group).getAllByRole<HTMLInputElement>('radio'))
    expect(radios.some((radio) => radio.checked)).toBe(true)
    expect(radios.some((radio) => !radio.checked)).toBe(true)
  })
})
