import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/vue'
import type { KeyValueStorage } from '@/application/ports'
import { createPreferences } from '@/application/preferences'
import type { Locale } from '@/domain/language'
import type { WikiTopic } from '@/domain/wiki'
import { renderApp } from '@/presentation/__tests__/app'
import {
  button,
  inPanel,
  modifiedCards,
  openPanel,
  panel,
  renderChoice,
} from '@/presentation/__tests__/customize'
import {
  forgetDialogs,
  isOpenAsModal,
  pressEscape,
  pressOutside,
} from '@/presentation/__tests__/dialog'
import { createMemoryStorage, preferencesFor } from '@/presentation/__tests__/screen'
import { HINT_LABEL, hintText } from '@/presentation/__tests__/wiki-library'

// Feature wiki, slice 4, criteria 10 and 11: every parameter of the panel Customize has a help
// button "?" right beside its label, named "Help: {parameter}". It opens the hint of the topic of
// its parameter — the same hint as Why? in the review — over the panel, which stays open
// underneath. Close, Esc and a press on the backdrop of the hint close the hint alone, the focus
// back on the help button that opened it. The help button changes no setting, and works for a
// parameter that is unavailable. Read the article leaves the choice screen for the article, the
// settings changed before kept; with no session on a question, the article offers Practice this.

afterEach(() => {
  cleanup()
  forgetDialogs()
})

const TEXTS = {
  en: {
    customize: 'Customize',
    rhythm: 'Rhythm',
    signs: 'Signs',
    help: 'Help: ',
    close: 'Close',
    readArticle: 'Read the article',
    parameters: [
      'From',
      'To',
      'Ledger lines',
      'Question length',
      'Time signatures',
      'Durations',
      'Rests',
      'Dots',
      'Ask for the duration',
      'Key signatures',
      'Accidentals',
    ],
    titles: {
      'treble-staff': 'Notes on the treble staff',
      durations: 'Durations of notes and rests',
      accidentals: 'Sharp, flat and natural',
      'key-signatures': 'Key signatures',
    },
  },
  ru: {
    customize: 'Настроить',
    rhythm: 'Ритм',
    signs: 'Знаки',
    help: 'Справка: ',
    close: 'Закрыть',
    readArticle: 'Читать статью',
    parameters: [
      'От',
      'До',
      'Добавочные линейки',
      'Длина вопроса',
      'Размеры',
      'Длительности',
      'Паузы',
      'Точки',
      'Спрашивать длительность',
      'Ключевые знаки',
      'Случайные знаки',
    ],
    titles: {
      'treble-staff': 'Ноты на нотоносце в скрипичном ключе',
      durations: 'Длительности нот и пауз',
      accidentals: 'Диез, бемоль и бекар',
      'key-signatures': 'Знаки при ключе',
    },
  },
  es: {
    customize: 'Personalizar',
    rhythm: 'Ritmo',
    signs: 'Signos',
    help: 'Ayuda: ',
    close: 'Cerrar',
    readArticle: 'Leer el artículo',
    parameters: [
      'Desde',
      'Hasta',
      'Líneas adicionales',
      'Longitud de la pregunta',
      'Compases',
      'Duraciones',
      'Silencios',
      'Puntillos',
      'Preguntar la duración',
      'Armaduras',
      'Alteraciones',
    ],
    titles: {
      'treble-staff': 'Notas en el pentagrama en clave de sol',
      durations: 'Duraciones de notas y silencios',
      accidentals: 'Sostenido, bemol y becuadro',
      'key-signatures': 'Armaduras de clave',
    },
  },
} as const

type Texts = (typeof TEXTS)[Locale]
const EN = TEXTS.en

// The table of the feature: the topic of the hint of each parameter, in the order of the panel.
const TOPICS: readonly (readonly [string, Exclude<WikiTopic, 'keys'>])[] = [
  ['From', 'treble-staff'],
  ['To', 'treble-staff'],
  ['Ledger lines', 'treble-staff'],
  ['Question length', 'durations'],
  ['Time signatures', 'durations'],
  ['Durations', 'durations'],
  ['Rests', 'durations'],
  ['Dots', 'durations'],
  ['Ask for the duration', 'durations'],
  ['Key signatures', 'key-signatures'],
  ['Accidentals', 'accidentals'],
]

// The parameters with a group of values have a fieldset named by its legend; the others are one
// control named by its label.
const GROUPS = [
  'Ledger lines',
  'Question length',
  'Time signatures',
  'Durations',
  'Key signatures',
  'Accidentals',
]

const helpName = (parameter: string, texts: Texts = EN) => `${texts.help}${parameter}`

const help = (parameter: string, texts: Texts = EN) =>
  inPanel(texts.customize).getByRole('button', { name: helpName(parameter, texts) })

const helpButtons = (texts: Texts = EN) =>
  inPanel(texts.customize).getAllByRole('button', {
    name: (name) => name.startsWith(texts.help),
  })

const hint = (title: string) => screen.getByRole('dialog', { name: title })
const findHint = (title: string) => screen.findByRole('dialog', { name: title })

// The hint text has markup in it, so it is matched on the whole text of the innermost element
// that holds all of it.
const shown = (text: string) => (_: string, element: Element | null) =>
  element?.textContent?.replace(/\s+/g, ' ').trim() === text &&
  ![...element.children].some((child) => child.textContent?.replace(/\s+/g, ' ').trim() === text)

const isBefore = (first: Node, second: Node) =>
  (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

// The controls that set a parameter: the list, the values of its group or its one box.
function controlsOf(parameter: string): HTMLElement[] {
  if (parameter === 'From' || parameter === 'To')
    return [inPanel().getByRole('combobox', { name: parameter })]
  if (GROUPS.includes(parameter))
    return [...inPanel().getByRole('group', { name: parameter }).querySelectorAll('input')]
  return [inPanel().getByRole('checkbox', { name: parameter })]
}

// Pitch is expanded when the panel opens; Rhythm and Signs are expanded here too.
async function openAllSections(texts: Texts = EN) {
  await openPanel(texts)
  for (const name of [texts.rhythm, texts.signs])
    await fireEvent.click(inPanel(texts.customize).getByRole('button', { name }))
}

async function openHelp(parameter: string, title: string, texts: Texts = EN) {
  await fireEvent.click(help(parameter, texts))
  return findHint(title)
}

const savedSettings = (storage: KeyValueStorage) => {
  const { preset, difficulty, modified } = createPreferences(storage, ['en'])
  return { preset, difficulty, modified }
}

describe('the help buttons of Customize', () => {
  it('are one for each parameter, in the order of the panel', async () => {
    renderChoice()

    await openAllSections()

    expect(
      helpButtons().map((each) => each.getAttribute('aria-label') ?? each.textContent),
    ).toEqual(EN.parameters.map((parameter) => helpName(parameter)))
  })

  it('show "?" and are plain buttons', async () => {
    renderChoice()

    await openAllSections()

    for (const each of helpButtons()) {
      expect(each.textContent?.trim()).toBe('?')
      expect(each.tagName).toBe('BUTTON')
      expect(each.getAttribute('type')).toBe('button')
    }
  })

  it('stand each beside its parameter, between the controls of the one before and the one after', async () => {
    renderChoice()

    await openAllSections()

    EN.parameters.forEach((parameter, index) => {
      const own = help(parameter)
      const before = EN.parameters[index - 1]
      const after = EN.parameters[index + 1]
      const misplaced = [
        ...(before ? controlsOf(before).filter((control) => !isBefore(control, own)) : []),
        ...(after ? controlsOf(after).filter((control) => !isBefore(own, control)) : []),
      ]
      expect({ parameter, misplaced }).toEqual({ parameter, misplaced: [] })
    })
  })

  it('leave the names of the groups and of the controls as they were', async () => {
    renderChoice()

    await openAllSections()

    for (const name of GROUPS) expect(inPanel().getByRole('group', { name })).toBeTruthy()
    for (const name of ['From', 'To'])
      expect(inPanel().getByRole('combobox', { name })).toBeTruthy()
    for (const name of ['Rests', 'Dots', 'Ask for the duration'])
      expect(inPanel().getByRole('checkbox', { name })).toBeTruthy()
  })

  it('show only in an expanded section', async () => {
    renderChoice()

    await openPanel()

    expect(helpButtons().map((each) => each.getAttribute('aria-label'))).toEqual([
      'Help: From',
      'Help: To',
      'Help: Ledger lines',
    ])
  })
})

describe.each(TOPICS)('the help of %s', (parameter, topic) => {
  const title = EN.titles[topic]

  it(`opens the hint of ${topic} over the panel, which stays open`, async () => {
    renderChoice()
    await openAllSections()

    const dialog = await openHelp(parameter, title)

    expect(isOpenAsModal(dialog)).toBe(true)
    expect(within(dialog).getByRole('heading').textContent?.trim()).toBe(title)
    expect(await within(dialog).findByText(shown(hintText(topic, 'en')))).toBeTruthy()
    expect(within(dialog).getByRole('img', { name: HINT_LABEL })).toBeTruthy()
    expect(within(dialog).getByRole('link', { name: EN.readArticle }).getAttribute('href')).toBe(
      `/wiki/${topic}`,
    )
    expect(within(dialog).getByRole('button', { name: EN.close })).toBeTruthy()
    expect(isOpenAsModal(panel())).toBe(true)
  })

  it('closes with Close, the panel still open and the focus back on the help', async () => {
    renderChoice()
    await openAllSections()
    const dialog = await openHelp(parameter, title)

    await fireEvent.click(within(dialog).getByRole('button', { name: EN.close }))

    expect(screen.queryByRole('dialog', { name: title })).toBeNull()
    expect(isOpenAsModal(panel())).toBe(true)
    await waitFor(() => expect(document.activeElement).toBe(help(parameter)))
  })
})

describe('the hint opened from Customize', () => {
  const TITLE = EN.titles['treble-staff']

  it('takes the focus inside it', async () => {
    renderChoice()
    await openPanel()

    const dialog = await openHelp('Ledger lines', TITLE)

    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('closes with Esc alone, the focus back on the help; a second Esc closes the panel', async () => {
    renderChoice()
    await openPanel()
    await openHelp('Ledger lines', TITLE)

    await pressEscape()

    expect(screen.queryByRole('dialog', { name: TITLE })).toBeNull()
    expect(isOpenAsModal(panel())).toBe(true)
    await waitFor(() => expect(document.activeElement).toBe(help('Ledger lines')))

    await pressEscape()

    expect(screen.queryByRole('dialog', { name: EN.customize })).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(button(EN.customize)))
  })

  it('closes with a press on its backdrop alone, the focus back on the help', async () => {
    renderChoice()
    await openPanel()
    const dialog = await openHelp('Ledger lines', TITLE)

    await pressOutside(dialog)

    expect(screen.queryByRole('dialog', { name: TITLE })).toBeNull()
    expect(isOpenAsModal(panel())).toBe(true)
    await waitFor(() => expect(document.activeElement).toBe(help('Ledger lines')))
  })

  it('is not closed by a press inside it off the controls', async () => {
    renderChoice()
    await openPanel()
    const dialog = await openHelp('Ledger lines', TITLE)
    await within(dialog).findByText(shown(hintText('treble-staff', 'en')))

    await fireEvent.click(within(dialog).getByRole('heading'))
    await fireEvent.click(within(dialog).getByText(shown(hintText('treble-staff', 'en'))))

    expect(isOpenAsModal(hint(TITLE))).toBe(true)
    expect(isOpenAsModal(panel())).toBe(true)
  })

  it('lets another help open its own hint, the focus back on that one', async () => {
    renderChoice()
    await openAllSections()
    await openHelp('Ledger lines', TITLE)
    await pressEscape()

    const dialog = await openHelp('Accidentals', EN.titles.accidentals)
    expect(await within(dialog).findByText(shown(hintText('accidentals', 'en')))).toBeTruthy()
    await pressEscape()

    expect(isOpenAsModal(panel())).toBe(true)
    await waitFor(() => expect(document.activeElement).toBe(help('Accidentals')))
  })

  it('lets the same help open it again', async () => {
    renderChoice()
    await openPanel()
    await openHelp('From', TITLE)
    await pressEscape()

    const dialog = await openHelp('From', TITLE)

    expect(isOpenAsModal(dialog)).toBe(true)
  })
})

describe('opening and closing a hint from Customize', () => {
  it('changes no setting: the preset and the values stay as they were', async () => {
    const storage = renderChoice()
    await openAllSections()
    const before = savedSettings(storage)

    for (const [parameter, topic] of TOPICS) {
      const dialog = await openHelp(parameter, EN.titles[topic])
      await fireEvent.click(within(dialog).getByRole('button', { name: EN.close }))
    }

    expect(savedSettings(storage)).toEqual(before)
    expect(modifiedCards()).toEqual([])
    expect(inPanel().getByRole('checkbox', { name: 'Rests' })).toHaveProperty('checked', false)
  })
})

// Spec 6.1: a value that gives no question is unavailable. Half notes alone fill a bar of 3/4 only
// when dotted, so with them in 3/4 alone neither 4/4 can be checked nor Dots unchecked (as in
// dots.spec.ts).
describe('the help of an unavailable parameter', () => {
  async function blockDots() {
    renderChoice()
    await openAllSections()
    const box = (name: string) => inPanel().getByRole('checkbox', { name })
    await fireEvent.click(inPanel().getByRole('radio', { name: 'One bar' }))
    await fireEvent.click(box('Quarter note 1/4'))
    await fireEvent.click(box('3/4'))
    await fireEvent.click(box('Dots'))
    await fireEvent.click(box('4/4'))
    expect(box('Dots')).toHaveProperty('disabled', true)
  }

  it('is available and opens its hint', async () => {
    await blockDots()

    expect(help('Dots')).toHaveProperty('disabled', false)
    const dialog = await openHelp('Dots', EN.titles.durations)

    expect(await within(dialog).findByText(shown(hintText('durations', 'en')))).toBeTruthy()
  })
})

describe.each(['ru', 'es'] as const)('in %s', (locale) => {
  const texts = TEXTS[locale]

  it('the help buttons are named in the language of the interface', async () => {
    renderChoice({ locale })

    await openAllSections(texts)

    expect(helpButtons(texts).map((each) => each.getAttribute('aria-label'))).toEqual(
      texts.parameters.map((parameter) => helpName(parameter, texts)),
    )
    expect(inPanel(texts.customize).queryAllByRole('button', { name: /^Help: / })).toEqual([])
  })

  it('the hint is in the language of the interface', async () => {
    renderChoice({ locale })
    await openPanel(texts)

    const [, , ledgerLines = ''] = texts.parameters
    const dialog = await openHelp(ledgerLines, texts.titles['treble-staff'], texts)

    expect(await within(dialog).findByText(shown(hintText('treble-staff', locale)))).toBeTruthy()
    expect(within(dialog).getByRole('link', { name: texts.readArticle })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: texts.close })).toBeTruthy()
  })
})

// Criterion 9 from the panel: without a session on a question the article offers Practice this.
describe('Read the article from a hint of Customize', () => {
  async function readFromRests() {
    const storage = createMemoryStorage()
    const app = await renderApp({ preferences: preferencesFor(['en'], storage) })
    await openPanel()
    await fireEvent.click(inPanel().getByRole('button', { name: EN.rhythm }))
    await fireEvent.click(inPanel().getByRole('checkbox', { name: 'Rests' }))
    const dialog = await openHelp('Rests', EN.titles.durations)
    await fireEvent.click(await within(dialog).findByRole('link', { name: EN.readArticle }))
    await screen.findByRole('heading', { level: 1, name: EN.titles.durations })
    await screen.findByText('About durations in en.')
    return { ...app, storage }
  }

  it('opens the article of the hint, the choice screen and both dialogs left', async () => {
    const { router } = await readFromRests()

    expect(router.currentRoute.value.path).toBe('/wiki/durations')
    expect(screen.queryAllByRole('dialog')).toEqual([])
    expect(screen.queryByRole('heading', { name: 'How many questions?' })).toBeNull()
  })

  it('offers Practice this and no Back to the question', async () => {
    await readFromRests()

    expect(screen.getByRole('button', { name: 'Practice this' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Back to the question' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Back to the question' })).toBeNull()
  })

  it('keeps the setting changed in the panel before', async () => {
    const { storage } = await readFromRests()

    expect(createPreferences(storage, ['en']).difficulty.rests).toBe(true)
  })
})
