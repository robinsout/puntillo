import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import type { KeyValueStorage } from '@/application/ports'
import type { Locale } from '@/domain/language'
import {
  backToTrainer,
  openSettings,
  renderApp,
  renderSettings,
} from '@/presentation/__tests__/app'
import {
  startSession,
  createMemoryStorage,
  fullStorage,
  preferencesFor,
  unavailableStorage,
} from '@/presentation/__tests__/screen'

// Feature language-and-naming, slice 5: the notice about an unavailable or full storage
// (edge case 1). Feature progress-and-storage, slice 1, criteria 18, 19: the same notice speaks
// of the progress too, and a full storage found by saving the answers of a session brings it.
// Feature navigation-and-settings, slice 1, criterion 10 and edge case 3: the settings are on the
// settings screen, and the notice is shown both there and on the choice screen.

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup)

const NOTICE: Record<Locale, string> = {
  en: "Progress and settings won't be saved in this browser.",
  ru: 'Прогресс и настройки не сохранятся в этом браузере.',
  es: 'El progreso y los ajustes no se guardarán en este navegador.',
}
const LOCALES = Object.keys(NOTICE) as Locale[]

const AT_ONCE = 'Show the right answer at once'
const AUTO_NEXT = 'Open next question automatically'

const button = (name: string) => screen.getByRole('button', { name })
const box = (name: string) => screen.getByRole<HTMLInputElement>('checkbox', { name })
const list = (name: string) => screen.getByRole<HTMLSelectElement>('combobox', { name })

const noticesIn = (locale: Locale) => screen.queryAllByText(NOTICE[locale])
const allNotices = () => LOCALES.flatMap(noticesIn)

function expectNoNotice() {
  expect(allNotices()).toEqual([])
}

function expectOneNoticeIn(locale: Locale) {
  expect(noticesIn(locale)).toHaveLength(1)
  expect(allNotices()).toHaveLength(1)
}

// A page load on the choice screen or on the settings screen, a new user unless the storage holds
// more: First steps, which does not ask for the duration; its first question is D4.
const loadTrainer = (storage: KeyValueStorage, browserLanguages: readonly string[] = ['en']) =>
  renderApp({ storage, preferences: preferencesFor(browserLanguages, storage) })
const loadSettings = (storage: KeyValueStorage, browserLanguages: readonly string[] = ['en']) =>
  renderSettings({ storage, preferences: preferencesFor(browserLanguages, storage) })

async function choose(listName: string, optionName: string) {
  const select = list(listName)
  const option = within(select).getByRole<HTMLOptionElement>('option', { name: optionName })
  await fireEvent.update(select, option.value)
}

const chooseLanguage = (name: string) => choose('Language', name)
const chooseNoteNaming = (name: string) => choose('Note names', name)

async function chooseH() {
  await chooseNoteNaming('C, D, E')
  await fireEvent.click(screen.getByRole('radio', { name: 'H' }))
}

// From the length choice through a question and the results back to the length choice. The first
// question of First steps is D4, named re in the default naming.
async function goRoundOneSession(onQuestion: () => Promise<void> = async () => {}, nameOfD = 're') {
  await startSession('No limit')
  await onQuestion()
  await fireEvent.click(button(nameOfD))
  if (screen.queryByRole('button', { name: 'Check' })) await fireEvent.click(button('Check'))
  await fireEvent.click(button('Finish'))
  expect(screen.queryByRole('heading', { name: 'Results' })).not.toBeNull()
  expectNoNotice()
  await fireEvent.click(button('New session'))
}

describe('the notice about settings that will not be saved', () => {
  describe('with a working storage', () => {
    it.each(LOCALES)(
      'is not shown on the choice screen nor on the settings in %s',
      async (locale) => {
        await loadTrainer(createMemoryStorage(), [locale])
        expectNoNotice()

        await openSettings(locale)

        expectNoNotice()
      },
    )

    it('is not shown after every setting is changed', async () => {
      await loadSettings(createMemoryStorage())

      await fireEvent.click(box(AT_ONCE))
      await chooseH()
      await chooseNoteNaming('до, ре, ми')
      await fireEvent.click(box(AUTO_NEXT))
      await backToTrainer()
      await goRoundOneSession(undefined, 'ре')
      await fireEvent.click(button('Confident reading'))
      expectNoNotice()
      await openSettings()
      await chooseLanguage('Español')

      expectNoNotice()
    })
  })

  describe('with a storage unavailable from the start', () => {
    it.each(LOCALES)('is shown at once, once, on the choice screen in %s', async (locale) => {
      await loadTrainer(unavailableStorage(), [locale])

      expectOneNoticeIn(locale)
    })

    it.each(LOCALES)('is shown at once, once, on the settings screen in %s', async (locale) => {
      await loadSettings(unavailableStorage(), [locale])

      expectOneNoticeIn(locale)
    })

    it('stays one line after several choices', async () => {
      await loadSettings(unavailableStorage())

      await fireEvent.click(box(AT_ONCE))
      await chooseH()
      await fireEvent.click(box(AT_ONCE))

      expectOneNoticeIn('en')
    })

    it('follows the chosen language', async () => {
      await loadSettings(unavailableStorage())

      await chooseLanguage('Русский')
      expectOneNoticeIn('ru')

      await choose('Язык', 'Español')
      expectOneNoticeIn('es')
    })

    it('is the last line of the choice screen, below its controls', async () => {
      await loadTrainer(unavailableStorage())

      expectNoticeBelowEveryControl()
      expectNoticeLast()
    })

    it('is below every setting on the settings screen', async () => {
      await loadSettings(unavailableStorage())

      expectNoticeBelowEveryControl()
    })

    it('is below every setting with the seventh note switch shown', async () => {
      await loadSettings(unavailableStorage())

      await chooseNoteNaming('C, D, E')

      expect(screen.queryByRole('radio', { name: 'H' })).not.toBeNull()
      expectNoticeBelowEveryControl()
    })

    it('is a line of text, not a dialog, and cannot be closed', async () => {
      await loadTrainer(unavailableStorage())

      expect(screen.queryByRole('dialog')).toBeNull()
      expect(screen.queryByRole('alertdialog')).toBeNull()
      const buttons = screen.getAllByRole('button').map((each) => each.textContent?.trim())
      expect(buttons).toEqual([
        'First steps',
        'Confident reading',
        'Advanced',
        'Customize',
        'Start',
      ])
    })

    it('is not a dialog on the settings screen either', async () => {
      await loadSettings(unavailableStorage())

      expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).not.toBeNull()
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(screen.queryByRole('alertdialog')).toBeNull()
    })

    it('is not on the question screen nor on the results, and is back once after them', async () => {
      await loadTrainer(unavailableStorage())

      await goRoundOneSession(async () => {
        expect(screen.queryByRole('heading', { name: 'Name the note' })).not.toBeNull()
        expectNoNotice()
      })

      expect(screen.queryByRole('heading', { name: 'Session length' })).not.toBeNull()
      expectOneNoticeIn('en')
    })

    it('does not get in the way of the trainer', async () => {
      await loadTrainer(unavailableStorage())
      await startSession('No limit')

      await fireEvent.click(button('re'))
      await fireEvent.click(button('Check'))

      expect(screen.getByRole('status').textContent?.trim()).toBe('Correct')
    })
  })

  describe('with a full storage', () => {
    it.each(LOCALES)('is not shown before anything is chosen in %s', async (locale) => {
      await loadTrainer(fullStorage(), [locale])
      expectNoNotice()

      await openSettings(locale)

      expectNoNotice()
    })

    it.each<[string, () => Promise<void>, Locale]>([
      ['a language', () => chooseLanguage('Русский'), 'ru'],
      ['a note naming', () => chooseNoteNaming('до, ре, ми'), 'en'],
      ['the seventh note', chooseH, 'en'],
      ['the box Show the right answer at once', () => fireEvent.click(box(AT_ONCE)), 'en'],
      ['the box Open next question automatically', () => fireEvent.click(box(AUTO_NEXT)), 'en'],
    ])('appears once on the settings screen after %s fails to save', async (_, change, locale) => {
      await loadSettings(fullStorage())

      await change()

      expectOneNoticeIn(locale)
    })

    it('appears once after choosing a preset fails to save', async () => {
      await loadTrainer(fullStorage())

      await fireEvent.click(button('Confident reading'))

      expectOneNoticeIn('en')
    })

    it('appears on the choice screen too once a setting fails to save', async () => {
      await loadSettings(fullStorage())
      await fireEvent.click(box(AUTO_NEXT))

      await backToTrainer()

      expectOneNoticeIn('en')
    })

    it('appears once back on the length choice when the answers fail to save', async () => {
      await loadTrainer(fullStorage())

      await goRoundOneSession()

      expectOneNoticeIn('en')
    })

    it('appears on the settings screen once the answers fail to save', async () => {
      await loadTrainer(fullStorage())
      await goRoundOneSession()

      await openSettings()

      expectOneNoticeIn('en')
    })

    it('stays one line after an answer and a choice fail to save', async () => {
      await loadTrainer(fullStorage())

      await goRoundOneSession()
      await openSettings()
      await fireEvent.click(box(AT_ONCE))

      expectOneNoticeIn('en')
    })

    it('stays one line after further choices', async () => {
      await loadSettings(fullStorage())

      await fireEvent.click(box(AT_ONCE))
      await chooseH()
      await fireEvent.click(box(AT_ONCE))
      await backToTrainer()
      await goRoundOneSession(undefined, 'D')

      expectOneNoticeIn('en')
    })

    it('is the last line of the choice screen once it appears', async () => {
      await loadTrainer(fullStorage())

      await fireEvent.click(button('Confident reading'))

      expectNoticeBelowEveryControl()
      expectNoticeLast()
    })

    it('is below every setting once it appears on the settings screen', async () => {
      await loadSettings(fullStorage())

      await chooseH()

      expectNoticeBelowEveryControl()
    })
  })
})

// Every control on the screen comes before the notice. The links of the screens are no part of
// it: the settings screen ends with the link Trainer.
function expectNoticeBelowEveryControl() {
  const [notice] = noticesIn('en')
  if (!notice) throw new Error('the notice is not shown')
  const main = screen.getByRole('main')
  const controls = [
    ...within(main).getAllByRole('button'),
    ...within(main).queryAllByRole('checkbox'),
    ...within(main).queryAllByRole('combobox'),
    ...within(main).queryAllByRole('radio'),
  ]
  for (const control of controls) {
    expect(control.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  }
}

// No text follows the notice.
function expectNoticeLast() {
  expect(screen.getByRole('main').textContent?.trim().endsWith(NOTICE.en)).toBe(true)
}

// Screen readers announce a change of a live region that is already on the page, so both screens
// always have the status, empty while the choices can be saved. With Note names it is the only
// status there.
describe('the notice for screen readers', () => {
  const statusText = () => screen.getByRole('status').textContent?.trim()

  it('is an empty status with a working storage', async () => {
    await loadTrainer(createMemoryStorage())
    expect(statusText()).toBe('')

    await openSettings()

    expect(statusText()).toBe('')
  })

  it('is a status with the notice when the storage is unavailable from the start', async () => {
    await loadTrainer(unavailableStorage(), ['ru'])
    expect(statusText()).toBe(NOTICE.ru)

    await openSettings('ru')

    expect(statusText()).toBe(NOTICE.ru)
  })

  it('fills the status already on the settings screen once a choice fails to save', async () => {
    await loadSettings(fullStorage())
    const status = screen.getByRole('status')
    expect(statusText()).toBe('')

    await fireEvent.click(box(AT_ONCE))

    expect(screen.getByRole('status')).toBe(status)
    expect(statusText()).toBe(NOTICE.en)
  })

  it('fills the status once the answers of a session fail to save', async () => {
    await loadTrainer(fullStorage())

    await goRoundOneSession()

    expect(statusText()).toBe(NOTICE.en)
  })

  it('is still a status in the chosen language', async () => {
    await loadSettings(fullStorage())

    await chooseLanguage('Español')

    expect(statusText()).toBe(NOTICE.es)
  })

  it('stays empty after every setting is changed with a working storage', async () => {
    await loadSettings(createMemoryStorage())

    await fireEvent.click(box(AT_ONCE))
    await chooseH()
    await chooseLanguage('Русский')

    expect(statusText()).toBe('')
  })
})
