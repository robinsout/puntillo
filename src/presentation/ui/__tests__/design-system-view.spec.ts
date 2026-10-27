import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { forgetDialogs, isOpenAsModal, pressEscape } from '@/presentation/__tests__/dialog'
import tokensCss from '@/presentation/ui/tokens.css?raw'
import DesignSystemView from '@/presentation/ui/catalog/DesignSystemView.vue'
import { contrastRatio } from '@/presentation/ui/contrast'
import { AA_LARGE, AA_NORMAL, TOKEN_PAIRS } from '@/presentation/ui/token-pairs'
import { readTokens } from '@/presentation/ui/tokens'

// Feature design-system, slice 1, criteria 5 and 7: the catalog shows every token with its value
// and the contrast of every pair of tokens used together. The catalog is a tool for developers, so
// its texts are English only. Feature navigation-and-settings, slice 1: the section Components
// shows each component of the system in its states; slice 2 adds the icons, the header and the
// navigation, whose links need a router; slice 3 the button and the grid of options; slice 4 the
// switch of segments, the card of a choice and the icon check. Feature design-system, slice 2: the
// bar of progress, the key of an answer in its states and the icons close and cross; slice 5 the
// tile of a figure; slice 6 the text field, the list of links and the icons chevron and back;
// slice 7 the dialog in both variants, the disclosure, the round icon button, and the options of
// the grid and the segments that are unavailable with their reason. Feature header-logo, slice 1,
// criterion 4: the sign of the app.

afterEach(() => {
  cleanup()
  forgetDialogs()
})

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
    'UiSegmented',
    'UiChoiceCard',
    'UiProgress',
    'UiAnswerKey',
    'UiStat',
    'UiTextField',
    'UiLinkList',
    'UiDialog',
    'UiDisclosure',
    'UiIconButton',
    'UiLogo',
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

  // Feature microphone-input, slice 4: as the box, a list may be described by a line beside it.
  it('shows a list with a description', () => {
    renderCatalog()

    const lists = components().getAllByRole('combobox', { name: /\S/, description: /\S/ })
    expect(lists.length).toBeGreaterThan(0)
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

  it('names each icon it shows, the check among them', () => {
    renderCatalog()

    for (const name of [
      'trainer',
      'progress',
      'wiki',
      'settings',
      'check',
      'close',
      'cross',
      'chevron',
      'back',
    ]) {
      expect(components().getAllByText(name).length).toBeGreaterThan(0)
    }
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

  it('shows a switch of segments named by its label, one of them chosen', () => {
    renderCatalog()

    const segmented = components().getByText('UiSegmented').closest('h3')
    expect(segmented).not.toBeNull()
    const groups = [
      ...components().queryAllByRole('group', { name: /\S/ }),
      ...components().queryAllByRole('radiogroup', { name: /\S/ }),
    ].filter((group) => follows(segmented as Element, group))
    const radios = groups.flatMap((group) => within(group).getAllByRole<HTMLInputElement>('radio'))
    expect(radios.some((radio) => radio.checked)).toBe(true)
    expect(radios.some((radio) => !radio.checked)).toBe(true)
  })

  it('shows a card of a choice pressed and one not pressed, each with a description', () => {
    renderCatalog()

    const cards = buttonsUnder('UiChoiceCard').filter((button) =>
      button.hasAttribute('aria-pressed'),
    )
    expect(cards.some((card) => card.getAttribute('aria-pressed') === 'true')).toBe(true)
    expect(cards.some((card) => card.getAttribute('aria-pressed') === 'false')).toBe(true)
    expect(cards.every((card) => card.getAttribute('aria-describedby'))).toBe(true)
  })

  it('shows a bar of progress named by its label', () => {
    renderCatalog()

    const bars = components().getAllByRole('progressbar', { name: /\S/ })
    expect(bars.length).toBeGreaterThan(0)
    expect(bars.every((bar) => bar.hasAttribute('aria-valuenow'))).toBe(true)
  })

  it('shows the key of an answer plain, pressed, disabled and in each mark', () => {
    renderCatalog()

    const keys = buttonsUnder('UiAnswerKey').filter((button) => button.hasAttribute('aria-pressed'))
    const marks = keys.map((each) => each.getAttribute('data-mark'))
    expect(keys.some((each) => !each.hasAttribute('data-mark') && !each.disabled)).toBe(true)
    expect(keys.some((each) => each.getAttribute('aria-pressed') === 'true')).toBe(true)
    expect(keys.some((each) => !each.hasAttribute('data-mark') && each.disabled)).toBe(true)
    for (const mark of ['correct', 'wrong', 'rejected']) expect(marks).toContain(mark)
  })

  it('shows tiles of figures, each a term with its value', () => {
    renderCatalog()

    const terms = components().getAllByRole('term')
    const definitions = components().getAllByRole('definition')
    expect(terms.length).toBeGreaterThan(0)
    expect(definitions).toHaveLength(terms.length)
    expect([...terms, ...definitions].every((each) => textOf(each))).toBe(true)
  })
})

describe('the text field and the list of links in the catalog', () => {
  it('shows a text field named by its label', () => {
    renderCatalog()

    const fields = [
      ...elementsUnder('UiTextField', 'textbox'),
      ...elementsUnder('UiTextField', 'searchbox'),
    ]
    expect(fields.length).toBeGreaterThan(0)
    expect(fields.every((field) => screen.getAllByLabelText(/\S/).includes(field))).toBe(true)
  })

  it('shows a list of links, each ending with its chevron for the eye only', () => {
    renderCatalog()

    const links = elementsUnder('UiLinkList', 'link')
    expect(links.length).toBeGreaterThan(1)
    for (const link of links) {
      expect(textOf(link)).toBeTruthy()
      expect(link.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
    }
  })
})

describe('the dialog, the disclosure and the icon button in the catalog', () => {
  it('opens a dialog and a sheet, each modal and named by its title', async () => {
    renderCatalog()

    const variants: string[] = []
    for (const opener of buttonsUnder('UiDialog')) {
      await fireEvent.click(opener)
      const dialog = screen.getByRole('dialog', { name: /\S/ })
      expect(isOpenAsModal(dialog)).toBe(true)
      variants.push(...[...dialog.classList].filter((name) => ['center', 'sheet'].includes(name)))
      await pressEscape()
      expect(screen.queryByRole('dialog')).toBeNull()
    }
    expect(variants.sort()).toEqual(['center', 'sheet'])
  })

  it('shows a disclosure expanded and one collapsed', () => {
    renderCatalog()

    const states = buttonsUnder('UiDisclosure').map((each) => each.getAttribute('aria-expanded'))
    expect(states).toContain('true')
    expect(states).toContain('false')
  })

  it('shows an icon button named by its label, not by its sign', () => {
    renderCatalog()

    const buttons = buttonsUnder('UiIconButton')
    expect(buttons.length).toBeGreaterThan(0)
    for (const each of buttons) {
      expect([...each.classList]).toContain('ui-icon-button')
      expect(each.getAttribute('aria-label')).toBeTruthy()
    }
  })

  it.each(['UiOptionGrid', 'UiSegmented'])(
    'shows %s with an unavailable option and its reason',
    (component) => {
      renderCatalog()

      const unavailable = elementsUnder<HTMLInputElement>(component, 'radio').filter(
        (radio) => radio.disabled,
      )
      expect(unavailable.length).toBeGreaterThan(0)
      for (const radio of unavailable) expect(radio.getAttribute('aria-describedby')).toBeTruthy()
    },
  )
})

const follows = (before: Element, after: Element) =>
  Boolean(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING)

// The elements of a role shown under the heading of a component, up to the next heading.
function elementsUnder<T extends HTMLElement = HTMLElement>(component: string, role: string): T[] {
  const region = screen.getByRole('region', { name: 'Components' })
  const headings = [...region.querySelectorAll('h3')]
  const heading = headings.find((each) => each.textContent?.trim() === component)
  if (!heading) throw new Error(`no heading ${component}`)
  const next = headings[headings.indexOf(heading) + 1]
  return within(region)
    .queryAllByRole<T>(role)
    .filter((element) => follows(heading, element) && (!next || follows(element, next)))
}

const buttonsUnder = (component: string) => elementsUnder<HTMLButtonElement>(component, 'button')

describe('the sign of the app in the catalog', () => {
  it('shows the sign under its heading UiLogo', () => {
    renderCatalog()

    const region = screen.getByRole('region', { name: 'Components' })
    const headings = [...region.querySelectorAll('h3')]
    const heading = headings.find((each) => each.textContent?.trim() === 'UiLogo')
    expect(heading).toBeDefined()
    const next = headings[headings.indexOf(heading!) + 1]
    const signs = [...region.querySelectorAll('svg')].filter(
      (svg) => follows(heading!, svg) && (!next || follows(svg, next)),
    )
    expect(signs.length).toBeGreaterThan(0)
    expect(signs[0]?.querySelector('ellipse')).not.toBeNull()
  })
})
