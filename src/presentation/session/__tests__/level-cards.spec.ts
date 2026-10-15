import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import type { Preset } from '@/domain/difficulty'
import type { Locale } from '@/domain/language'
import { backToTrainer, openSettings, renderApp } from '@/presentation/__tests__/app'
import {
  button,
  inPanel,
  modifiedCards,
  openPanel,
  queryButton,
  renderChoice,
} from '@/presentation/__tests__/customize'
import { forgetDialogs } from '@/presentation/__tests__/dialog'
import { storageWithNoteNaming, storageWithPreset } from '@/presentation/__tests__/screen'

// Feature navigation-and-settings, slice 4: the level on the start screen (criteria 13, 16, 17).
//
// - The subheading Level (h2), with Customize beside it, then the three cards of the presets, in
//   a column: First steps, Confident reading, Advanced.
// - A card is a toggle button named by the preset alone. It shows a small drawing of a fixed
//   example of the preset, labelled Example, and a line of its range and its question length in
//   the naming chosen, "do4–do5 · one note", which is the description of the button.
// - Once the values are changed in Customize no card is chosen; Modified and Reset show under the
//   cards, as before, and Reset brings back the preset chosen last, chosen.
//
// Feature fast-start: the example is no longer a staff drawn by VexFlow but a drawing made
// beforehand, src/presentation/preferences/preset-examples/<preset>.svg, so it cannot fail to
// load. It is checked by the data-source of its svg, the same as in its file; the stub of the
// staff, with its data-pitch, is not on the start screen at all.
//
// A new user, so First steps; the names of the notes are do, re, mi unless chosen otherwise.

afterEach(() => {
  cleanup()
  forgetDialogs()
})

const TEXTS = {
  en: {
    level: 'Level',
    customize: 'Customize',
    done: 'Done',
    example: 'Example',
    modified: 'Modified',
    reset: 'Reset',
    upToTwo: 'Up to two',
    presets: ['First steps', 'Confident reading', 'Advanced'],
    lines: ['do4–do5 · one note', 'do4–sol5 · one bar', 'la3–do6 · two bars'],
  },
  ru: {
    level: 'Уровень',
    customize: 'Настроить',
    done: 'Готово',
    example: 'Пример',
    modified: 'Изменено',
    reset: 'Сбросить',
    upToTwo: 'До двух',
    presets: ['Первые шаги', 'Уверенное чтение', 'Продвинутый'],
    lines: ['до4–до5 · одна нота', 'до4–соль5 · один такт', 'ля3–до6 · два такта'],
  },
  es: {
    level: 'Nivel',
    customize: 'Personalizar',
    done: 'Listo',
    example: 'Ejemplo',
    modified: 'Modificado',
    reset: 'Restablecer',
    upToTwo: 'Hasta dos',
    presets: ['Primeros pasos', 'Lectura segura', 'Avanzado'],
    lines: ['do4–do5 · una nota', 'do4–sol5 · un compás', 'la3–do6 · dos compases'],
  },
} as const satisfies Record<Locale, Record<string, string | readonly string[]>>

const LOCALES = Object.keys(TEXTS) as Locale[]
const EN = TEXTS.en
const [FIRST_STEPS, CONFIDENT_READING, ADVANCED] = EN.presets

// Russian users read the Cyrillic names; the others the Latin ones, the default.
const namingStorage = (locale: Locale) =>
  locale === 'ru' ? storageWithNoteNaming('cyrillic-syllable') : undefined

const card = (name: string) => screen.getByRole('button', { name })
const pressedCards = (names: readonly string[] = EN.presets) =>
  names.filter((name) => card(name).getAttribute('aria-pressed') === 'true')
const exampleIn = (name: string, label: string = EN.example) =>
  within(card(name)).queryByRole('img', { name: label })
const drawingIn = (name: string) => exampleIn(name)?.querySelector('svg') ?? null
// Vitest runs from the root of the project.
const EXAMPLES_DIRECTORY = `${process.cwd()}/src/presentation/preferences/preset-examples/`
const dataSourceOfFile = (preset: Preset) =>
  /<svg\b[^>]*\sdata-source="([^"]*)"/.exec(
    readFileSync(`${EXAMPLES_DIRECTORY}${preset}.svg`, 'utf8'),
  )?.[1]
const levelHeading = (name: string = EN.level) => screen.queryByRole('heading', { level: 2, name })
const follows = (before: Element, after: Element) =>
  Boolean(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING)

async function chooseInSettings(listName: string, optionName: string) {
  const list = screen.getByRole<HTMLSelectElement>('combobox', { name: listName })
  const option = within(list).getByRole<HTMLOptionElement>('option', { name: optionName })
  await fireEvent.update(list, option.value)
}

// A change that every preset leaves: Up to two ledger lines is Advanced's alone.
async function customize(texts: { customize: string; upToTwo: string; done: string } = EN) {
  await openPanel(texts)
  await fireEvent.click(inPanel(texts.customize).getByRole('radio', { name: texts.upToTwo }))
  await fireEvent.click(inPanel(texts.customize).getByRole('button', { name: texts.done }))
}

describe('the subheading Level (criterion 16)', () => {
  it.each(LOCALES)('is a second-level heading in %s', (locale) => {
    renderChoice({ locale })

    expect(levelHeading(TEXTS[locale].level)).not.toBeNull()
    expect(screen.queryByRole('heading', { level: 1, name: TEXTS[locale].level })).toBeNull()
  })

  it.each(LOCALES)('has Customize beside it, before the cards, in %s', (locale) => {
    const texts = TEXTS[locale]
    renderChoice({ locale })

    const heading = levelHeading(texts.level)
    if (!heading) throw new Error('no heading Level')
    const customizeButton = button(texts.customize)
    expect(follows(heading, customizeButton)).toBe(true)
    expect(follows(customizeButton, card(texts.presets[0]))).toBe(true)
  })

  it('opens the panel Customize, as before', async () => {
    renderChoice()

    const panel = await openPanel()

    expect(panel).toBeTruthy()
  })
})

describe('the cards of the presets (criterion 13)', () => {
  it.each(LOCALES)('are First steps, Confident reading and Advanced in order in %s', (locale) => {
    const { presets } = TEXTS[locale]
    renderChoice({ locale })

    const cards = presets.map(card)
    expect(follows(cards[0] as Element, cards[1] as Element)).toBe(true)
    expect(follows(cards[1] as Element, cards[2] as Element)).toBe(true)
  })

  it.each(LOCALES)('come right under the subheading Level in %s', (locale) => {
    const texts = TEXTS[locale]
    renderChoice({ locale })

    const heading = levelHeading(texts.level)
    if (!heading) throw new Error('no heading Level')
    const between = screen
      .getAllByRole('button')
      .filter((each) => follows(heading, each) && follows(each, card(texts.presets[0])))
    expect(between).toEqual([button(texts.customize)])
  })

  it.each(LOCALES)('describe each preset by its range and question length in %s', (locale) => {
    const { presets, lines } = TEXTS[locale]
    renderChoice({ locale, storage: namingStorage(locale) })

    presets.forEach((name, index) => {
      const line = lines[index] ?? ''
      expect(screen.getByRole('button', { name, description: line })).toBeTruthy()
      expect(within(card(name)).getByText(line)).toBeTruthy()
    })
  })

  it('name the notes C, D, E when they are chosen', () => {
    renderChoice({ storage: storageWithNoteNaming('letter') })

    expect(
      screen.getByRole('button', { name: FIRST_STEPS, description: 'C4–C5 · one note' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: ADVANCED, description: 'A3–C6 · two bars' }),
    ).toBeTruthy()
  })

  it('follow the names of the notes changed in Settings', async () => {
    await renderApp()
    await openSettings()
    await chooseInSettings('Note names', 'C, D, E')

    await backToTrainer()

    expect(
      screen.getByRole('button', { name: CONFIDENT_READING, description: 'C4–G5 · one bar' }),
    ).toBeTruthy()
  })

  it('have the chosen one pressed, and only it', async () => {
    renderChoice({ storage: storageWithPreset('advanced') })

    expect(pressedCards()).toEqual([ADVANCED])
  })

  // Feature fast-start, criteria 1 and 4: the example is a drawing made beforehand, not a staff
  // drawn by VexFlow; the svg of the card keeps the data-source of its file.
  it.each(LOCALES)('each show a drawing of its example labelled Example in %s', (locale) => {
    const texts = TEXTS[locale]
    renderChoice({ locale })

    for (const name of texts.presets) {
      const example = exampleIn(name, texts.example)
      expect(example?.querySelector('svg path'), `drawing of "${name}"`).not.toBeNull()
    }
  })

  it.each([
    [FIRST_STEPS, 'first-steps'],
    [CONFIDENT_READING, 'confident-reading'],
    [ADVANCED, 'advanced'],
  ] as const)('show %s by the drawing of the example of %s', (name, preset) => {
    renderChoice()

    expect(drawingIn(name)?.getAttribute('data-source')).toBe(dataSourceOfFile(preset))
  })

  it('show the same example whatever the random source', () => {
    renderChoice()
    const first = drawingIn(FIRST_STEPS)?.getAttribute('data-source')
    expect(first).toBe(dataSourceOfFile('first-steps'))
    cleanup()
    forgetDialogs()

    renderChoice({ random: { next: () => 0.99 } })

    expect(drawingIn(FIRST_STEPS)?.getAttribute('data-source')).toBe(first)
  })

  it('draw no staff of VexFlow on the start screen', () => {
    renderChoice()

    expect(document.querySelector('[data-pitch]')).toBeNull()
  })

  it('choose a card by a press on its drawing', async () => {
    renderChoice()

    const drawing = drawingIn(ADVANCED)
    if (!drawing) throw new Error('no drawing in Advanced')
    await fireEvent.click(drawing)

    expect(pressedCards()).toEqual([ADVANCED])
  })
})

describe('the cards after a change in Customize (criterion 13)', () => {
  it('have none chosen', async () => {
    renderChoice()

    await customize()

    expect(pressedCards()).toEqual([])
  })

  it.each(LOCALES)('show Modified and Reset under them in %s', async (locale) => {
    const texts = TEXTS[locale]
    renderChoice({ locale })

    await customize(texts)

    const modified = screen.getByText(texts.modified)
    expect(follows(card(texts.presets[2]), modified)).toBe(true)
    expect(follows(card(texts.presets[2]), button(texts.reset))).toBe(true)
  })

  it('keep their lines: the line tells of the preset, not of the values changed', async () => {
    renderChoice()

    await customize()

    expect(
      screen.getByRole('button', { name: FIRST_STEPS, description: /^do4–do5 · one note/ }),
    ).toBeTruthy()
  })

  it('get the preset chosen last back, chosen, with Reset', async () => {
    renderChoice({ storage: storageWithPreset('confident-reading') })
    await customize()

    await fireEvent.click(button(EN.reset))

    expect(pressedCards()).toEqual([CONFIDENT_READING])
    expect(queryButton(EN.reset)).toBeNull()
    expect(screen.queryByText(EN.modified)).toBeNull()
  })

  it('get a card chosen by a press on it', async () => {
    renderChoice()
    await customize()

    await fireEvent.click(card(CONFIDENT_READING))

    expect(pressedCards()).toEqual([CONFIDENT_READING])
    expect(modifiedCards()).toEqual([])
  })
})
