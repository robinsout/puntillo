import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/vue'
import type { KeyValueStorage, Random } from '@/application/ports'
import { createPreferences } from '@/application/preferences'
import type { Preset } from '@/domain/difficulty'
import type { Locale } from '@/domain/language'
import type { NoteNaming } from '@/domain/naming'
import {
  chooseLength,
  createManualClock,
  createMemoryStorage,
  preferencesFor,
  renderSessionWith,
} from '@/presentation/__tests__/screen'

// Feature multi-note-questions, slice 1: a question of two to four notes on the trainer screen,
// criteria 9–12 and 14–17, edge cases 1–3. The quick mode is slice 2.

// Vitest globals are off, so Testing Library does not clean up by itself.
afterEach(cleanup)

// Gives the values in turn, then the last one for ever.
function inTurn(...values: number[]): Random {
  const queue = [...values]
  const last = values.at(-1) ?? 0
  return { next: () => queue.shift() ?? last }
}

// Confident reading, C4–G5, with whole to eighth notes. The question spends the values in turn:
// the number of notes, then the pitch and the duration of each note. This one is three notes,
// C4 half (do 1/2), E4 quarter (mi 1/4) and G4 quarter (sol 1/4), then the questions go on with
// C4 and D4 halves for a 0.
const DO_MI_SOL = () => inTurn(0.4, 0, 0, 1.5 / 11, 0, 3.5 / 11, 0)

interface Visit {
  random?: Random
  preset?: Preset
  locale?: Locale
  naming?: NoteNaming
  showAnswerAtOnce?: boolean
}

function storageWithSeveralNotes({ preset, naming, showAnswerAtOnce }: Visit): KeyValueStorage {
  const storage = createMemoryStorage()
  const preferences = createPreferences(storage, ['en'])
  preferences.choosePreset(preset ?? 'confident-reading')
  preferences.customize({ questionLength: 'two-to-four-notes' })
  if (naming) preferences.chooseNoteNaming(naming)
  if (showAnswerAtOnce) preferences.chooseShowAnswerAtOnce(true)
  return storage
}

const NO_LIMIT: Record<Locale, string> = { en: 'No limit', ru: 'Без ограничения', es: 'Sin límite' }

async function renderTrainer(visit: Visit = {}) {
  const locale = visit.locale ?? 'en'
  renderSessionWith({
    random: visit.random ?? DO_MI_SOL(),
    clock: createManualClock().clock,
    preferences: preferencesFor([locale], storageWithSeveralNotes(visit)),
  })
  await chooseLength(NO_LIMIT[locale])
}

const button = (name: string) => screen.getByRole('button', { name })
const queryButton = (name: string) => screen.queryByRole('button', { name })
const press = (name: string) => fireEvent.click(button(name))
const status = () => screen.getByRole('status').textContent?.trim()
const shown = (attribute: 'data-pitch' | 'data-duration') =>
  screen.getByRole('img', { name: 'Music staff' }).getAttribute(attribute)

// The targets laid over the notes of the staff are named by the number of the note.
const target = (number: number) => button(`Note ${number}`)
const targets = () => screen.queryAllByRole('button', { name: /^Note \d$/ })

// The mark and the answer of a note reach a screen reader as the description of its target.
function description(element: HTMLElement): string {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
    .join(' ')
    .trim()
}

const isPressed = (name: string) => button(name).getAttribute('aria-pressed') === 'true'
const exactText = (text: string) => screen.queryByText(text, { normalizer: (raw) => raw.trim() })

async function answerNote(name: string, duration?: string) {
  await press(name)
  if (duration) await press(duration)
}

async function answerAll(...answers: [string, string][]) {
  for (const [name, duration] of answers) await answerNote(name, duration)
}

const RIGHT: [string, string][] = [
  ['do', '1/2'],
  ['mi', '1/4'],
  ['sol', '1/4'],
]

// Note 2 has a wrong name (fa for mi) and note 3 a wrong duration (1/2 for 1/4).
async function triedWrong() {
  await answerAll(['do', '1/2'], ['fa', '1/4'], ['sol', '1/2'])
  await press('Check')
}

describe('a question of several notes', () => {
  it('draws the notes of the question on the staff', async () => {
    await renderTrainer()

    expect(shown('data-pitch')).toBe('C4 E4 G4')
    expect(shown('data-duration')).toBe('half quarter quarter')
  })

  // Criterion 9 and edge case 3.
  it('lays a target over each note, the first one current', async () => {
    await renderTrainer()

    expect(targets()).toHaveLength(3)
    expect(target(1).getAttribute('aria-current')).toBe('true')
    expect(target(2).getAttribute('aria-current')).not.toBe('true')
    expect(target(3).getAttribute('aria-current')).not.toBe('true')
  })

  it('puts the targets before the answer buttons, in the order of the notes', async () => {
    await renderTrainer()

    const order = screen.getAllByRole('button')
    const at = (element: HTMLElement) => order.indexOf(element)
    expect(at(target(1))).toBeLessThan(at(target(2)))
    expect(at(target(2))).toBeLessThan(at(target(3)))
    expect(at(target(3))).toBeLessThan(at(button('do')))
  })

  // Criterion 11 and edge case 2.
  describe('moving between the notes', () => {
    it('offers Previous note unavailable and Next note available on the first note', async () => {
      await renderTrainer()

      expect(button('Previous note').matches(':disabled')).toBe(true)
      expect(button('Next note').matches(':disabled')).toBe(false)
    })

    it('moves the highlight with Next note and Previous note', async () => {
      await renderTrainer()

      await press('Next note')
      expect(target(2).getAttribute('aria-current')).toBe('true')
      expect(target(1).getAttribute('aria-current')).not.toBe('true')

      await press('Next note')
      expect(target(3).getAttribute('aria-current')).toBe('true')
      expect(button('Next note').matches(':disabled')).toBe(true)
      expect(button('Previous note').matches(':disabled')).toBe(false)

      await press('Previous note')
      expect(target(2).getAttribute('aria-current')).toBe('true')
    })

    it('makes a note current when it is pressed on the staff', async () => {
      await renderTrainer()

      await fireEvent.click(target(3))

      expect(target(3).getAttribute('aria-current')).toBe('true')
      expect(screen.getAllByRole('button', { current: true })).toHaveLength(1)
    })
  })

  // Criteria 10 and 12.
  describe('answering note by note', () => {
    it('gives the chosen name to the current note and waits there for its duration', async () => {
      await renderTrainer()

      await press('do')

      expect(isPressed('do')).toBe(true)
      expect(target(1).getAttribute('aria-current')).toBe('true')
      expect(description(target(1))).toBe('')
    })

    it('writes the answer under the note and moves on once both are chosen', async () => {
      await renderTrainer()

      await answerNote('do', '1/2')

      expect(exactText('do 1/2')).not.toBeNull()
      expect(description(target(1))).toBe('do 1/2')
      expect(target(2).getAttribute('aria-current')).toBe('true')
      expect(isPressed('do')).toBe(false)
      expect(isPressed('1/2')).toBe(false)
    })

    it('writes each answer under its own note', async () => {
      await renderTrainer()

      await answerAll(['re', '1/1'], ['fa', '1/8'])

      expect(description(target(1))).toBe('re 1/1')
      expect(description(target(2))).toBe('fa 1/8')
      expect(description(target(3))).toBe('')
      expect(target(3).getAttribute('aria-current')).toBe('true')
    })

    it('stays on the last note once it is answered', async () => {
      await renderTrainer()
      await fireEvent.click(target(3))

      await answerNote('sol', '1/4')

      expect(target(3).getAttribute('aria-current')).toBe('true')
    })

    it('goes on to the next note without an answer, past the answered ones', async () => {
      await renderTrainer()
      await fireEvent.click(target(2))
      await answerNote('mi', '1/4')
      await fireEvent.click(target(1))

      await answerNote('do', '1/2')

      expect(target(3).getAttribute('aria-current')).toBe('true')
    })

    it('shows the choice of a note made current again and lets it be changed there', async () => {
      await renderTrainer()
      await answerNote('do', '1/2')

      await fireEvent.click(target(1))
      expect(isPressed('do')).toBe(true)
      expect(isPressed('1/2')).toBe(true)

      await press('re')

      expect(description(target(1))).toBe('re 1/2')
      expect(exactText('re 1/2')).not.toBeNull()
      expect(exactText('do 1/2')).toBeNull()
      expect(target(1).getAttribute('aria-current')).toBe('true')
    })

    it('names the answer in the chosen system', async () => {
      await renderTrainer({ naming: 'letter' })

      await answerNote('C', '1/2')

      expect(description(target(1))).toBe('C 1/2')
    })
  })

  // Criterion 14.
  it('asks to answer every note on Check while one has no answer, and counts nothing', async () => {
    await renderTrainer()
    await answerAll(['do', '1/2'], ['mi', '1/4'])

    await press('Check')

    expect(status()).toBe('Answer every note')
    expect(exactText('Points: 0 of 0')).not.toBeNull()
    expect(queryButton('Check')).not.toBeNull()
    expect(queryButton('Next')).toBeNull()
  })

  it('asks to answer every note while the current one has its name only', async () => {
    await renderTrainer()
    await answerAll(['do', '1/2'], ['mi', '1/4'])
    await press('sol')

    await press('Check')

    expect(status()).toBe('Answer every note')
  })

  // Criterion 15.
  it('says Correct and counts two points a note for the right answer', async () => {
    await renderTrainer()
    await answerAll(...RIGHT)

    await press('Check')

    expect(status()).toBe('Correct')
    expect(exactText('Points: 6 of 6')).not.toBeNull()
    expect(exactText('Streak: 1')).not.toBeNull()
    expect(queryButton('Next')).not.toBeNull()
  })

  it('opens the next question on its first note, with no answers', async () => {
    await renderTrainer()
    await answerAll(...RIGHT)
    await press('Check')

    await press('Next')

    expect(shown('data-pitch')).toBe('C4 D4')
    expect(targets()).toHaveLength(2)
    expect(target(1).getAttribute('aria-current')).toBe('true')
    expect(description(target(1))).toBe('')
    expect(exactText('do 1/2')).toBeNull()
  })

  // Criterion 16.
  describe('a wrong first attempt', () => {
    it('says "Incorrect. Try again." and counts the right parts only', async () => {
      await renderTrainer()

      await triedWrong()

      expect(status()).toBe('Incorrect. Try again.')
      expect(exactText('Points: 4 of 6')).not.toBeNull()
      expect(exactText('Streak: 0')).not.toBeNull()
    })

    it('marks the wrong notes on the staff, for the screen reader too', async () => {
      await renderTrainer()

      await triedWrong()

      expect(description(target(1))).toBe('do 1/2')
      expect(description(target(2))).toMatch(/\bIncorrect\b/)
      expect(description(target(3))).toMatch(/\bIncorrect\b/)
      expect(description(target(1))).not.toMatch(/Incorrect/)
    })

    it('makes the first wrong note current and leaves the right ones out', async () => {
      await renderTrainer()

      await triedWrong()

      expect(target(2).getAttribute('aria-current')).toBe('true')
      expect(target(1).matches(':disabled')).toBe(true)
      expect(button('Previous note').matches(':disabled')).toBe(true)
      expect(button('Next note').matches(':disabled')).toBe(false)
    })

    it('tries again only the wrong part of a wrong note', async () => {
      await renderTrainer()

      await triedWrong()

      expect(isPressed('1/4')).toBe(true)
      expect(button('1/4').matches(':disabled')).toBe(true)
      expect(button('fa').matches(':disabled')).toBe(true)
      expect(description(button('fa'))).toBe('Incorrect')
      expect(button('mi').matches(':disabled')).toBe(false)
    })

    it('goes from one wrong note to the next', async () => {
      await renderTrainer()
      await triedWrong()

      await press('mi')

      expect(target(3).getAttribute('aria-current')).toBe('true')
      expect(isPressed('sol')).toBe(true)
      expect(button('sol').matches(':disabled')).toBe(true)
      expect(button('1/2').matches(':disabled')).toBe(true)
    })

    it('asks to answer every note while a wrong one has no new answer', async () => {
      await renderTrainer()
      await triedWrong()
      await press('mi')

      await press('Check')

      expect(status()).toBe('Answer every note')
    })

    it('says "Correct on the second try" when every wrong part is put right, the points as they were', async () => {
      await renderTrainer()
      await triedWrong()
      await press('mi')
      await press('1/4')

      await press('Check')

      expect(status()).toBe('Correct on the second try')
      expect(exactText('Points: 4 of 6')).not.toBeNull()
    })
  })

  // Criterion 17.
  describe('the review', () => {
    it('explains each note wrong in the second attempt, with its number', async () => {
      await renderTrainer()
      await triedWrong()
      await press('re')
      await press('1/8')

      await press('Check')

      expect(status()).toBe(
        'Note 2: You chose re. This is mi: the note on the 1st line. ' +
          'Note 3: You chose an eighth note. This is a quarter note.',
      )
      expect(queryButton('Next')).not.toBeNull()
    })

    it('leaves out a note put right in the second attempt', async () => {
      await renderTrainer()
      await triedWrong()
      await press('mi')
      await press('1/8')

      await press('Check')

      expect(status()).toBe('Note 3: You chose an eighth note. This is a quarter note.')
    })

    it('explains every wrong note at once when the right answer is shown at once', async () => {
      await renderTrainer({ showAnswerAtOnce: true })

      await triedWrong()

      expect(status()).toBe(
        'Note 2: You chose fa. This is mi: the note on the 1st line. ' +
          'Note 3: You chose a half note. This is a quarter note.',
      )
      expect(exactText('Points: 4 of 6')).not.toBeNull()
    })

    it('explains both parts of a note wrong in both', async () => {
      await renderTrainer({ showAnswerAtOnce: true })

      await answerAll(['re', '1/1'], ['mi', '1/4'], ['sol', '1/4'])
      await press('Check')

      expect(status()).toBe(
        'Note 1: You chose re. This is do: the note on the first ledger line below the staff. ' +
          'You chose a whole note. This is a half note.',
      )
    })
  })

  // First steps does not ask for the duration: D4–C5, half and quarter notes. A constant 0 gives
  // D4 and E4 halves.
  describe('without the duration asked', () => {
    const firstSteps = (): Visit => ({ preset: 'first-steps', random: inTurn(0) })

    it('moves on after the name and writes it alone under the note', async () => {
      await renderTrainer(firstSteps())

      await press('re')

      expect(description(target(1))).toBe('re')
      expect(target(2).getAttribute('aria-current')).toBe('true')
    })

    it('counts one point a note', async () => {
      await renderTrainer(firstSteps())
      await answerNote('re')
      await answerNote('fa')

      await press('Check')

      expect(status()).toBe('Incorrect. Try again.')
      expect(exactText('Points: 1 of 2')).not.toBeNull()
    })
  })

  describe('in Russian', () => {
    it('names the moves, the targets, the request and the review in Russian', async () => {
      await renderTrainer({ locale: 'ru', naming: 'cyrillic-syllable', showAnswerAtOnce: true })

      expect(button('Предыдущая нота')).toBeTruthy()
      expect(button('Следующая нота')).toBeTruthy()
      expect(button('Нота 1')).toBeTruthy()
      await press('Проверить')
      expect(status()).toBe('Ответьте на каждую ноту')

      await answerAll(['до', '1/2'], ['фа', '1/4'], ['соль', '1/4'])
      await press('Проверить')
      expect(status()).toBe('Нота 2: Вы выбрали фа. Это ми — нота на первой линейке.')
    })
  })

  describe('in Spanish', () => {
    it('names the moves, the targets, the request and the review in Spanish', async () => {
      await renderTrainer({ locale: 'es', showAnswerAtOnce: true })

      expect(button('Nota anterior')).toBeTruthy()
      expect(button('Nota siguiente')).toBeTruthy()
      expect(button('Nota 1')).toBeTruthy()
      await press('Comprobar')
      expect(status()).toBe('Responde a cada nota')

      await answerAll(['do', '1/2'], ['fa', '1/4'], ['sol', '1/4'])
      await press('Comprobar')
      expect(status()).toBe('Nota 2: Elegiste fa. Es mi: la nota en la primera línea.')
    })
  })
})

// Edge case 1: a question of one note looks and works as before.
describe('a question of one note', () => {
  it('has no targets over the staff, no moves and no answer under the note', async () => {
    renderSessionWith({
      random: inTurn(0),
      clock: createManualClock().clock,
      preferences: preferencesFor(['en']),
    })
    await chooseLength('No limit')

    await answerNote('do', '1/1')

    expect(targets()).toHaveLength(0)
    expect(queryButton('Previous note')).toBeNull()
    expect(queryButton('Next note')).toBeNull()
    expect(exactText('do 1/1')).toBeNull()
    expect(screen.queryAllByRole('button', { current: true })).toHaveLength(0)
    expect(isPressed('do')).toBe(true)
  })
})
