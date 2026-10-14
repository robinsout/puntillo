import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/vue'
import type { KeyValueStorage, Random } from '@/application/ports'
import { createPreferences } from '@/application/preferences'
import type { Locale } from '@/domain/language'
import { LETTERS } from '@/domain/pitch'
import { forgetDialogs } from '@/presentation/__tests__/dialog'
import {
  startSession,
  chooseShownDuration,
  createManualClock,
  createMemoryStorage,
  NAMES,
  preferencesFor,
  renderSessionWith,
  startingOnC4,
  storageWithOneNoteReading,
  lengthOption,
  type ManualClock,
  queryProgressBar,
} from '@/presentation/__tests__/screen'

// Feature session-summary, slice 3: Practice only these (criteria 10–13, edge cases 1, 2 and 6 in
// part, the sizes being the end-to-end tests').
//
// - Below Most mistakes, a button "Practice only these" starts a new session of the same exercise,
//   the same difficulty and the same length as the one that ended, on time and No limit included;
//   No limit ended by Finish gives No limit again.
// - The new session asks about the items of the list from its first question on, in the order of
//   the list; then it is a session like any other, ending in the usual results.
// - Without mistakes there is no such button.
// - The focus moves to the heading of the question, as on any start of a session (decision of
//   feature m1-session, slice 1).
// - Texts in three languages.
//
// The screen runs in Confident reading with one note in 4/4 unless told otherwise; questions start
// on C4 (do), a whole note, then D4 (re), C4… while no item of the review queue comes back. C4
// wrong, then D4 wrong, gives the list re4, then do4: a session that started on re4 can only have
// had it from the list.

afterEach(() => {
  cleanup()
  forgetDialogs()
  vi.restoreAllMocks()
})

const MINUTE = 60_000

const TEXTS = {
  en: {
    practice: 'Practice only these',
    heading: 'Most mistakes',
    noLimit: 'No limit',
    check: 'Check',
    next: 'Next',
    finish: 'Finish',
    readHeading: 'Name the note',
  },
  ru: {
    practice: 'Потренировать только их',
    heading: 'Больше всего ошибок',
    noLimit: 'Без ограничения',
    check: 'Проверить',
    next: 'Далее',
    finish: 'Завершить',
    readHeading: 'Назовите ноту',
  },
  es: {
    practice: 'Practicar solo estos',
    heading: 'Más errores',
    noLimit: 'Sin límite',
    check: 'Comprobar',
    next: 'Siguiente',
    finish: 'Terminar',
    readHeading: 'Nombra la nota',
  },
} as const satisfies Record<Locale, Record<string, string>>

type Texts = (typeof TEXTS)[Locale]
const EN = TEXTS.en

const button = (name: string) => screen.getByRole('button', { name })
const queryButton = (name: string) => screen.queryByRole('button', { name })
const press = (name: string) => fireEvent.click(button(name))
const queryText = (text: string | RegExp) => screen.queryByText(text)
const h1 = (name: string) => screen.queryByRole('heading', { level: 1, name })
const shownPitch = () => document.querySelector('[data-pitch]')?.getAttribute('data-pitch')
const mostMistakes = (name: string = EN.heading) => screen.queryByRole('list', { name })

function itemTexts(name: string = EN.heading): string[] {
  const list = mostMistakes(name)
  if (!list) throw new Error(`no list named ${name}`)
  return within(list)
    .getAllByRole('listitem')
    .map((item) => {
      const copy = item.cloneNode(true) as HTMLElement
      for (const link of copy.querySelectorAll('a, [role="link"]')) link.remove()
      return copy.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    })
}

interface Setup {
  readonly random?: Random
  readonly locale?: Locale
  readonly storage?: KeyValueStorage
  readonly clock?: ManualClock
}

async function start(length: string = EN.noLimit, setup: Setup = {}) {
  const {
    random = startingOnC4(),
    locale = 'en',
    storage = storageWithOneNoteReading(),
    clock = createManualClock(),
  } = setup
  renderSessionWith({
    random,
    clock: clock.clock,
    timer: clock.timer,
    preferences: preferencesFor([locale], storage),
  })
  await startSession(length)
  return clock
}

// One note in Confident reading here: no signs, so the pitch is a letter and an octave.
function rightName(): string {
  const letter = shownPitch()?.charAt(0)
  const name = NAMES[LETTERS.findIndex((each) => each === letter)]
  if (!name) throw new Error(`no note name for ${letter}`)
  return name
}

async function answerRight(texts: Texts = EN) {
  await press(rightName())
  await chooseShownDuration()
  await press(texts.check)
}

// The name wrong in both attempts, the duration right.
async function answerWrong(texts: Texts = EN) {
  const [first, second] = NAMES.filter((name) => name !== rightName())
  if (!first || !second) throw new Error('not enough wrong names')
  await press(first)
  await chooseShownDuration()
  await press(texts.check)
  await press(second)
  await press(texts.check)
}

function expectShown(pitch: string) {
  if (shownPitch() !== pitch) throw new Error(`expected ${pitch} on the staff, got ${shownPitch()}`)
}

// C4 wrong, then D4 wrong: Most mistakes lists re4, then do4.
async function wrongOnC4ThenD4(texts: Texts = EN) {
  expectShown('C4')
  await answerWrong(texts)
  await press(texts.next)
  expectShown('D4')
  await answerWrong(texts)
}

async function resultsWithMistakes(length: string = EN.noLimit, setup: Setup = {}) {
  const texts = TEXTS[setup.locale ?? 'en']
  const clock = await start(length, setup)
  await wrongOnC4ThenD4(texts)
  await press(texts.finish)
  return clock
}

describe('Practice only these', () => {
  describe('in the results (criterion 10, edge case 1)', () => {
    it('stands below the list Most mistakes', async () => {
      await resultsWithMistakes()

      const list = mostMistakes()
      const practice = button(EN.practice)
      expect(list).not.toBeNull()
      expect(
        (list as HTMLElement).compareDocumentPosition(practice) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    })

    it('is not there after a session without mistakes', async () => {
      await start()
      await answerRight()

      await press(EN.finish)

      expect(queryText('No mistakes')).not.toBeNull()
      expect(queryButton(EN.practice)).toBeNull()
    })

    it('leaves New session where it was', async () => {
      await resultsWithMistakes()

      expect(queryButton('New session')).not.toBeNull()
    })
  })

  describe('the new session (criteria 10 and 11)', () => {
    it('starts on the first item of the list', async () => {
      await resultsWithMistakes()
      expect(itemTexts()).toEqual(['re4, whole note — 1 mistake', 'do4, whole note — 1 mistake'])

      await press(EN.practice)

      expect(h1(EN.readHeading)).not.toBeNull()
      expect(shownPitch()).toBe('D4')
      expect(queryButton(EN.practice)).toBeNull()
    })

    it('asks about the next item of the list on the next question', async () => {
      await resultsWithMistakes()
      await press(EN.practice)
      await answerRight()

      await press(EN.next)

      expect(shownPitch()).toBe('C4')
    })

    it('starts with nothing scored', async () => {
      await resultsWithMistakes()

      await press(EN.practice)

      expect(queryText('Question 1')).not.toBeNull()
      expect(queryText('Streak: 0')).not.toBeNull()
    })

    it('has no limit after a session with no limit ended by Finish (edge case 2)', async () => {
      await resultsWithMistakes()

      await press(EN.practice)

      expect(queryText('Question 1')).not.toBeNull()
      expect(screen.queryByRole('progressbar')).toBeNull()
    })

    it('is a session of 10 after a session of 10', async () => {
      await resultsWithMistakes('10')

      await press(EN.practice)

      expect(queryProgressBar('Question 1 of 10')).not.toBeNull()
    })

    it('is a session of 3 minutes after one, from 0:00', async () => {
      const clock = await resultsWithMistakes('3 min')
      await clock.elapse(MINUTE)

      await press(EN.practice)

      expect(queryProgressBar('Time: 0:00')).not.toBeNull()
      await clock.elapse(1000)
      expect(queryProgressBar('Time: 0:01')).not.toBeNull()
    })

    it('moves the focus to the heading of the question', async () => {
      await resultsWithMistakes()
      button(EN.practice).focus()

      await press(EN.practice)

      await waitFor(() => expect(document.activeElement).toBe(h1(EN.readHeading)))
    })
  })

  describe('then a session like any other (criterion 12)', () => {
    it('ends in the usual results, with the mistakes of this session alone', async () => {
      await resultsWithMistakes()
      await press(EN.practice)
      expectShown('D4')
      await answerWrong()

      await press(EN.finish)

      expect(h1('Results')).not.toBeNull()
      expect(queryText('Questions: 1')).not.toBeNull()
      expect(itemTexts()).toEqual(['re4, whole note — 1 mistake'])
      expect(queryButton(EN.practice)).not.toBeNull()
    })

    it('ends with No mistakes and without the button when every answer is right', async () => {
      await resultsWithMistakes()
      await press(EN.practice)
      await answerRight()

      await press(EN.finish)

      expect(queryText('No mistakes')).not.toBeNull()
      expect(queryButton(EN.practice)).toBeNull()
    })

    // Feature navigation-and-settings, edge case 4: it starts at once and changes no choice of the
    // start screen.
    it('leaves the session length chosen on the start screen as it was', async () => {
      const storage = storageWithOneNoteReading()
      await resultsWithMistakes('20', { storage })
      await press(EN.practice)

      await press(EN.finish)

      expect(h1('Trainer')).not.toBeNull()
      expect(lengthOption('20').checked).toBe(true)
      expect(createPreferences(storage, ['en']).sessionLength).toBe(20)
    })
  })

  describe('Write notes (criterion 10)', () => {
    it('writes notes again, starting on the item of the list', async () => {
      // jsdom lays nothing out: every element is a box 360 wide and 100 high at the top of the
      // page; the staff lines of the stub run from y = 30 down to y = 70, a step 5: F4 at 65.
      const box = { x: 0, y: 0, top: 0, left: 0, width: 360, height: 100, right: 360, bottom: 100 }
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
        ...box,
        toJSON: () => box,
      } as DOMRect)
      await start(EN.noLimit, { storage: writingWithSigns(), random: fInGMajor() })
      const column = screen.getAllByRole('slider')[0] as HTMLElement
      await fireEvent.click(column, { clientX: 180, clientY: 65 })
      await press('Sharp')
      await press(EN.check)
      await press(EN.finish)
      expect(itemTexts()).toEqual(['fa♯4, whole note — 1 mistake'])

      await press(EN.practice)

      expect(h1('Write the notes')).not.toBeNull()
      expect(h1(EN.readHeading)).toBeNull()
      expect(shownPitch()).toBe('F#4')
    })
  })

  describe('the texts (criterion 13)', () => {
    it.each(['ru', 'es'] as const)('names the button in %s', async (locale) => {
      const texts = TEXTS[locale]
      await resultsWithMistakes(texts.noLimit, { locale })

      await press(texts.practice)

      expect(h1(texts.readHeading)).not.toBeNull()
      expect(shownPitch()).toBe('D4')
      expect(queryButton(EN.practice)).toBeNull()
    })
  })
})

// As in write-signs.spec.ts: Write notes in Confident reading with one note in 4/4, the duration
// not asked, up to two signs in the key signature, sharps, flats and naturals; the right answer
// shown at once.
function writingWithSigns(): KeyValueStorage {
  const storage = createMemoryStorage()
  const preferences = createPreferences(storage, ['en'])
  preferences.chooseExercise('write')
  preferences.choosePreset('confident-reading')
  preferences.customize({ questionLength: 'one-note' })
  preferences.customize({ timeSignature: { beats: 3, beatValue: 4 }, on: false })
  preferences.customize({ dots: false })
  preferences.customize({ askDuration: false })
  preferences.customize({ keySignatures: 2 })
  preferences.customize({ accidentals: 'sharp-flat-and-natural' })
  preferences.chooseShowAnswerAtOnce(true)
  return storage
}

// G major, F4, a whole note: sounds F♯ by the key signature, written without a sign.
function fInGMajor(): Random {
  const queue = [3.5 / 12, 0, 0.5, 0.4, 0]
  return { next: () => queue.shift() ?? 0 }
}
