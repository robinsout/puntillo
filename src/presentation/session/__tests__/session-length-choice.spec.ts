import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/vue'
import type { KeyValueStorage } from '@/application/ports'
import type { Locale } from '@/domain/language'
import { renderApp } from '@/presentation/__tests__/app'
import { forgetDialogs } from '@/presentation/__tests__/dialog'
import {
  chooseLength,
  chooseShownDuration,
  createManualClock,
  lengthGroup,
  lengthOption,
  lengthOptions,
  preferencesFor,
  progressOver,
  renderSessionWith,
  startButton,
  startingOnC4,
  startSession,
  storageWithOneNoteReading,
  storageWithSessionLength,
  unavailableStorage,
} from '@/presentation/__tests__/screen'

// Feature navigation-and-settings, slice 3: the session length is a choice on the start screen and
// Start begins the session (criteria 11, 14–16; edge cases 2 and 7, the import of a file being the
// application's).
//
// - From top to bottom: the block of the session not finished, Exercise, the presets with
//   Customize, the subheading Session length, the choice of length, Start, the notice about the
//   storage.
// - The lengths are one group of radio buttons named Session length: 10, 20, 50, No limit (shown
//   as ∞), 3 min, 5 min, 10 min. A press only chooses; 10 is chosen for a new user. The choice is
//   saved like the other preferences.
// - Start begins the session of the exercise, the level and the length chosen.
// - Trainer is the first-level heading, hidden from the eye, with the focus on it as the screen
//   opens; Session length is a second-level one.
//
// The page runs in Confident reading with one note in 4/4; questions start on C4 (do). A new
// render over the same storage stands for a reload.

afterEach(() => {
  cleanup()
  forgetDialogs()
})

const TEXTS = {
  en: {
    trainer: 'Trainer',
    length: 'Session length',
    start: 'Start',
    lengths: ['10', '20', '50', 'No limit', '3 min', '5 min', '10 min'],
  },
  ru: {
    trainer: 'Тренажёр',
    length: 'Длина сессии',
    start: 'Начать',
    lengths: ['10', '20', '50', 'Без ограничения', '3 мин', '5 мин', '10 мин'],
  },
  es: {
    trainer: 'Entrenador',
    length: 'Duración de la sesión',
    start: 'Empezar',
    lengths: ['10', '20', '50', 'Sin límite', '3 min', '5 min', '10 min'],
  },
} as const satisfies Record<Locale, Record<string, string | readonly string[]>>

const LOCALES = Object.keys(TEXTS) as Locale[]
const EN = TEXTS.en

const button = (name: string) => screen.getByRole('button', { name })
const queryButton = (name: string) => screen.queryByRole('button', { name })
const h1 = (name: string) => screen.queryByRole('heading', { level: 1, name })
const staff = () => screen.queryByRole('img', { name: 'Music staff' })
const checkedNames = () =>
  EN.lengths.filter((name) => lengthOption(name).checked) as readonly string[]

function openStart(storage: KeyValueStorage = storageWithOneNoteReading(), locale: Locale = 'en') {
  return renderSessionWith({
    random: startingOnC4(),
    clock: createManualClock().clock,
    preferences: preferencesFor([locale], storage),
    progress: progressOver(storage),
  })
}

function reload(storage: KeyValueStorage) {
  cleanup()
  openStart(storage)
}

const follows = (first: Element, second: Element) =>
  Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('the choice of length (criterion 14)', () => {
  it.each(LOCALES)('is one group of radio buttons named Session length in %s', (locale) => {
    openStart(storageWithOneNoteReading(), locale)

    expect(screen.getByRole('radiogroup', { name: TEXTS[locale].length })).toBeTruthy()
  })

  it.each(LOCALES)('offers the seven lengths in their order in %s', (locale) => {
    openStart(storageWithOneNoteReading(), locale)

    expect(lengthOptions()).toEqual(TEXTS[locale].lengths.map(lengthOption))
  })

  it('gives the options one name, so that the arrows move within them (edge case 7)', () => {
    openStart()

    const names = new Set(lengthOptions().map((radio) => radio.name))
    expect(names.size).toBe(1)
    expect([...names][0]).not.toBe('')
  })

  it('shows No limit as ∞', () => {
    openStart()

    expect(within(lengthGroup()).getByText('∞')).toBeTruthy()
    expect(within(lengthGroup()).queryByText('No limit')).toBeNull()
  })

  it('has 10 chosen for a new user, and only it', () => {
    openStart()

    expect(checkedNames()).toEqual(['10'])
  })

  it.each(EN.lengths)('chooses %s on a press, and only it', async (name) => {
    openStart()

    await chooseLength(name)

    expect(checkedNames()).toEqual([name])
  })

  it.each(EN.lengths)('starts no session on a press on %s', async (name) => {
    openStart()

    await chooseLength(name)

    expect(staff()).toBeNull()
    expect(h1(EN.trainer)).not.toBeNull()
    expect(startButton()).toBeTruthy()
  })

  it('moves the choice from one length to another', async () => {
    openStart()
    await chooseLength('3 min')

    await chooseLength('50')

    expect(checkedNames()).toEqual(['50'])
  })

  it('is the choice of the last visit after a reload', async () => {
    const storage = storageWithOneNoteReading()
    openStart(storage)
    await chooseLength('5 min')

    reload(storage)

    expect(checkedNames()).toEqual(['5 min'])
  })

  it('is the length saved, with nothing pressed', () => {
    openStart(storageWithSessionLength('unlimited'))

    expect(checkedNames()).toEqual(['No limit'])
  })

  it('holds until the next load when the storage is unavailable (edge case 3)', async () => {
    const storage = unavailableStorage()
    openStart(storage)

    await chooseLength('20')
    expect(checkedNames()).toEqual(['20'])

    reload(storage)
    expect(checkedNames()).toEqual(['10'])
  })

  it('is the length of the last session when the screen opens again after Finish', async () => {
    openStart()
    await startSession('20')

    await fireEvent.click(button('Finish'))

    expect(checkedNames()).toEqual(['20'])
  })
})

describe('Start (criterion 15)', () => {
  it.each(LOCALES)('is a button named Start in %s', (locale) => {
    openStart(storageWithOneNoteReading(), locale)

    expect(button(TEXTS[locale].start)).toBeTruthy()
  })

  it('comes after the choice of length', () => {
    openStart()

    expect(follows(lengthGroup(), startButton())).toBe(true)
  })

  it('starts a session of 10 with nothing pressed', async () => {
    openStart()

    await fireEvent.click(startButton())

    expect(screen.getByText('Question 1 of 10')).toBeTruthy()
  })

  it.each([
    ['20', 'Question 1 of 20'],
    ['50', 'Question 1 of 50'],
    ['No limit', 'Question 1'],
    ['3 min', 'Time: 0:00'],
    ['10 min', 'Time: 0:00'],
  ])('starts a session of the length chosen, %s: "%s"', async (length, shown) => {
    openStart()

    await startSession(length)

    expect(staff()?.getAttribute('data-pitch')).toBe('C4')
    expect(screen.getByText(shown)).toBeTruthy()
  })

  it('starts a session of No limit after a reload with No limit chosen', async () => {
    const storage = storageWithOneNoteReading()
    openStart(storage)
    await chooseLength('No limit')
    reload(storage)

    await fireEvent.click(startButton())

    expect(screen.getByText('Question 1')).toBeTruthy()
    expect(screen.queryByText(/^Question 1 of/)).toBeNull()
  })

  it('starts the exercise chosen', async () => {
    openStart()
    await fireEvent.click(screen.getByRole('radio', { name: 'Write notes' }))

    await fireEvent.click(startButton())

    expect(screen.getByRole('heading', { level: 1, name: 'Write the notes' })).toBeTruthy()
  })

  it('starts the level chosen', async () => {
    openStart()
    await fireEvent.click(button('First steps'))

    await fireEvent.click(startButton())

    // First steps asks for the name alone, without the durations.
    expect(queryButton('1/4')).toBeNull()
    expect(button('do')).toBeTruthy()
  })

  it('leaves the choice screen for the question', async () => {
    openStart()

    await startSession('20')

    expect(h1(EN.trainer)).toBeNull()
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(queryButton(EN.start)).toBeNull()
  })

  it('counts the session started by it as any other: Finish after a check gives the results', async () => {
    openStart()
    await startSession('20')
    await fireEvent.click(button('do'))
    await chooseShownDuration()
    await fireEvent.click(button('Check'))

    await fireEvent.click(button('Finish'))

    expect(h1('Results')).not.toBeNull()
  })
})

describe('the headings of the start screen (criterion 16)', () => {
  it.each(LOCALES)(
    'are Trainer, hidden from the eye, and Session length below it in %s',
    (locale) => {
      openStart(storageWithOneNoteReading(), locale)

      const title = h1(TEXTS[locale].trainer)
      expect(title).not.toBeNull()
      expect(title?.classList.contains('visually-hidden')).toBe(true)
      expect(screen.getByRole('heading', { level: 2, name: TEXTS[locale].length })).toBeTruthy()
      expect(h1(TEXTS[locale].length)).toBeNull()
    },
  )

  it('puts the focus on Trainer as the screen opens', async () => {
    await renderApp({ storage: storageWithOneNoteReading() })

    await waitFor(() => expect(document.activeElement).toBe(h1(EN.trainer)))
  })

  it('puts the focus on Trainer back from a session', async () => {
    openStart()
    await startSession('No limit')

    await fireEvent.click(button('Finish'))

    await waitFor(() => expect(document.activeElement).toBe(h1(EN.trainer)))
  })
})

describe('the start screen from top to bottom (criterion 11)', () => {
  // A session left after its first check, so that the block of it is shown, over a storage that
  // cannot save any more, so that the notice is shown too.
  async function storageWithSessionAndNotice(): Promise<KeyValueStorage> {
    const storage = storageWithOneNoteReading()
    openStart(storage)
    await startSession('20')
    await fireEvent.click(button('do'))
    await chooseShownDuration()
    await fireEvent.click(button('Check'))
    cleanup()
    return { ...storage, canSave: () => false }
  }

  it('is the session not finished, Exercise, the presets, Session length, Start, the notice', async () => {
    openStart(await storageWithSessionAndNotice())

    const order = [
      screen.getByRole('region', { name: 'Unfinished session' }),
      screen.getByRole('radio', { name: 'Read notes' }),
      button('First steps'),
      button('Customize'),
      screen.getByRole('heading', { level: 2, name: EN.length }),
      lengthGroup(),
      startButton(),
      screen.getByText("Progress and settings won't be saved in this browser."),
    ]
    for (let index = 1; index < order.length; index++) {
      const [before, after] = [order[index - 1], order[index]]
      if (!before || !after) throw new Error('missing element')
      expect(follows(before, after), `${index}`).toBe(true)
    }
  })

  it('has Start as the only button after the presets', () => {
    openStart()

    const buttons = screen.getAllByRole('button')
    expect(buttons.at(-1)).toBe(startButton())
    expect(buttons.filter((each) => follows(button('Customize'), each))).toEqual([startButton()])
  })
})
