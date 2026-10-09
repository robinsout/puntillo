import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import type { Locale } from '@/domain/language'
import {
  chooseLength,
  createMemoryStorage,
  fullStorage,
  loadSession,
  unavailableStorage,
} from '@/presentation/__tests__/screen'

// Feature language-and-naming, slice 5: the notice about an unavailable or full storage
// (edge case 1).

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup)

const NOTICE: Record<Locale, string> = {
  en: "Settings won't be saved in this browser.",
  ru: 'Настройки не сохранятся в этом браузере.',
  es: 'La configuración no se guardará en este navegador.',
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

// From the length choice through a question and the results back to the length choice. A new
// user is in First steps, which does not ask for the duration; its first question is D4, named re
// in the default naming.
async function goRoundOneSession(onQuestion: () => Promise<void> = async () => {}, nameOfD = 're') {
  await chooseLength('No limit')
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
    it.each(LOCALES)('is not shown in %s', (locale) => {
      loadSession(createMemoryStorage(), [locale])

      expectNoNotice()
    })

    it('is not shown after every setting is changed', async () => {
      loadSession(createMemoryStorage())

      await fireEvent.click(box(AT_ONCE))
      await chooseH()
      await chooseNoteNaming('до, ре, ми')
      await goRoundOneSession(() => fireEvent.click(box(AUTO_NEXT)), 'ре')
      await fireEvent.click(button('Confident reading'))
      await chooseLanguage('Español')

      expectNoNotice()
    })
  })

  describe('with a storage unavailable from the start', () => {
    it.each(LOCALES)('is shown at once, once, in %s', (locale) => {
      loadSession(unavailableStorage(), [locale])

      expectOneNoticeIn(locale)
    })

    it('stays one line after several choices', async () => {
      loadSession(unavailableStorage())

      await fireEvent.click(box(AT_ONCE))
      await chooseH()
      await fireEvent.click(box(AT_ONCE))

      expectOneNoticeIn('en')
    })

    it('follows the chosen language', async () => {
      loadSession(unavailableStorage())

      await chooseLanguage('Русский')
      expectOneNoticeIn('ru')

      await choose('Язык', 'Español')
      expectOneNoticeIn('es')
    })

    it('is the last line of the screen, below the settings', () => {
      loadSession(unavailableStorage())

      expectNoticeBelowEveryControl()
    })

    it('is the last line of the screen with the seventh note switch shown', async () => {
      loadSession(unavailableStorage())

      await chooseNoteNaming('C, D, E')

      expect(screen.queryByRole('radio', { name: 'H' })).not.toBeNull()
      expectNoticeBelowEveryControl()
    })

    it('is a line of text, not a dialog, and cannot be closed', () => {
      loadSession(unavailableStorage())

      expect(screen.queryByRole('dialog')).toBeNull()
      expect(screen.queryByRole('alertdialog')).toBeNull()
      const buttons = screen.getAllByRole('button').map((each) => each.textContent?.trim())
      expect(buttons).toEqual([
        'First steps',
        'Confident reading',
        'Advanced',
        '10',
        '20',
        '50',
        'No limit',
      ])
    })

    it('is not on the question screen nor on the results, and is back once after them', async () => {
      loadSession(unavailableStorage())

      await goRoundOneSession(async () => {
        expect(screen.queryByRole('heading', { name: 'Name the note' })).not.toBeNull()
        expectNoNotice()
      })

      expect(screen.queryByRole('heading', { name: 'How many questions?' })).not.toBeNull()
      expectOneNoticeIn('en')
    })

    it('does not get in the way of the trainer', async () => {
      loadSession(unavailableStorage())
      await chooseLength('No limit')

      await fireEvent.click(button('re'))
      await fireEvent.click(button('Check'))

      expect(screen.getByRole('status').textContent?.trim()).toBe('Correct')
    })
  })

  describe('with a full storage', () => {
    it.each(LOCALES)('is not shown before anything is chosen in %s', (locale) => {
      loadSession(fullStorage(), [locale])

      expectNoNotice()
    })

    it.each<[string, () => Promise<void>, Locale]>([
      ['a language', () => chooseLanguage('Русский'), 'ru'],
      ['a note naming', () => chooseNoteNaming('до, ре, ми'), 'en'],
      ['the seventh note', chooseH, 'en'],
      ['the box Show the right answer at once', () => fireEvent.click(box(AT_ONCE)), 'en'],
      ['a preset', () => fireEvent.click(button('Confident reading')), 'en'],
    ])('appears once after choosing %s fails to save', async (_, change, locale) => {
      loadSession(fullStorage())

      await change()

      expectOneNoticeIn(locale)
    })

    it('appears back on the length choice when the box on the question fails to save', async () => {
      loadSession(fullStorage())

      await goRoundOneSession(async () => {
        await fireEvent.click(box(AUTO_NEXT))
        expectNoNotice()
      })

      expectOneNoticeIn('en')
    })

    it('stays one line after further choices', async () => {
      loadSession(fullStorage())

      await fireEvent.click(box(AT_ONCE))
      await chooseH()
      await fireEvent.click(box(AT_ONCE))
      await goRoundOneSession(undefined, 'D')

      expectOneNoticeIn('en')
    })

    it('is the last line of the screen once it appears', async () => {
      loadSession(fullStorage())

      await chooseH()

      expectNoticeBelowEveryControl()
    })
  })
})

// Every control on the screen comes before the notice, and no text follows it.
function expectNoticeBelowEveryControl() {
  const [notice] = noticesIn('en')
  if (!notice) throw new Error('the notice is not shown')
  const main = screen.getByRole('main')
  const controls = [
    ...within(main).getAllByRole('button'),
    ...within(main).getAllByRole('checkbox'),
    ...within(main).getAllByRole('combobox'),
    ...within(main).queryAllByRole('radio'),
  ]
  for (const control of controls) {
    expect(control.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  }
  expect(main.textContent?.trim().endsWith(NOTICE.en)).toBe(true)
}

// Screen readers announce a change of a live region that is already on the page, so the length
// choice always has the status, empty while the choices can be saved. It is the only status there.
describe('the notice for screen readers', () => {
  const statusText = () => screen.getByRole('status').textContent?.trim()

  it('is an empty status with a working storage', () => {
    loadSession(createMemoryStorage())

    expect(statusText()).toBe('')
  })

  it('is a status with the notice when the storage is unavailable from the start', () => {
    loadSession(unavailableStorage(), ['ru'])

    expect(statusText()).toBe(NOTICE.ru)
  })

  it('fills the status already on the screen once a choice fails to save', async () => {
    loadSession(fullStorage())
    const status = screen.getByRole('status')
    expect(statusText()).toBe('')

    await fireEvent.click(box(AT_ONCE))

    expect(screen.getByRole('status')).toBe(status)
    expect(statusText()).toBe(NOTICE.en)
  })

  it('is still a status in the chosen language', async () => {
    loadSession(fullStorage())

    await chooseLanguage('Español')

    expect(statusText()).toBe(NOTICE.es)
  })

  it('stays empty after every setting is changed with a working storage', async () => {
    loadSession(createMemoryStorage())

    await fireEvent.click(box(AT_ONCE))
    await chooseH()
    await chooseLanguage('Русский')

    expect(statusText()).toBe('')
  })
})
