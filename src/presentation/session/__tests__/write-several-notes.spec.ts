import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/vue'
import type { KeyValueStorage, Random } from '@/application/ports'
import { createPreferences, type Preferences } from '@/application/preferences'
import type { QuestionLength } from '@/domain/difficulty'
import type { Locale } from '@/domain/language'
import type { NoteNaming } from '@/domain/naming'
import { forgetDialogs } from '@/presentation/__tests__/dialog'
import {
  chooseLength,
  createManualClock,
  createMemoryStorage,
  cycle,
  preferencesFor,
  renderSessionWith,
  statusText,
} from '@/presentation/__tests__/screen'

// Feature m2-write-notes, slice 2: Write notes with questions of several notes, rests and the
// duration (criteria 3, 4, 8–10, 12; edge cases 3–4).
//
// - The task names every note in order, separated by "; ", the current one marked with
//   aria-current; with the duration asked, each name is followed by its duration as a noun:
//   "sol4, quarter note", "sol4, dotted half note".
// - Each note has a column of its own, a slider "Note N"; the current one has aria-current. A touch
//   in another column makes its note current and writes it there at once. The arrow keys left and
//   right on a column, and Previous note and Next note, move between the notes, as in M1; the
//   focus follows to the column of the new current note. ▲▼ move the current note. Unlike M1,
//   writing a note does not move on to the next one.
// - The rests of the question are drawn already; they have no column and no points.
// - With the duration asked, a row of buttons named by the duration, "Quarter note", showing the
//   shape of the note, not a fraction, and Dot when the dots are on. Until its duration is chosen
//   a written note is drawn as a black head without a stem; without the duration asked, with the
//   duration of the question.
// - Check, never by itself, in the quick mode too; what is missing is asked for as in M1: "Answer
//   every note" for several notes, "Choose a duration first" for one note written without it.
// - The pitch and the duration are graded apart; the second attempt is on the wrong parts only:
//   a rejected duration cannot be chosen again, a rejected step not checked again. The review
//   tells each wrong part of each note under its number, the right notes drawn on the staff.

afterEach(() => {
  cleanup()
  forgetDialogs()
  vi.restoreAllMocks()
})

// jsdom lays nothing out, so every element is a box 360 wide and 100 high at the top of the page.
// The staff of the stub spans the whole box: its lines run from y = 30 down to y = 70, a step 5.
beforeEach(() => {
  const box = { x: 0, y: 0, top: 0, left: 0, width: 360, height: 100, right: 360, bottom: 100 }
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    ...box,
    toJSON: () => box,
  } as DOMRect)
})

// The height of a touch on each step of the stub's staff.
const AT = { C4: 80, D4: 75, E4: 70, F4: 65, G4: 60, A4: 55, B4: 50, C5: 45 } as const

// Gives the values in turn, then the last one for ever.
function inTurn(...values: number[]): Random {
  const queue = [...values]
  const last = values.at(-1) ?? 0
  return { next: () => queue.shift() ?? last }
}

// Confident reading, C4–G5, whole to eighth notes, 4/4 alone, no signs. A question of 2–4 notes
// spends the values in turn: the number of notes, then the pitch and the duration of each note.
// This one is C4 half (do4), E4 quarter (mi4), G4 quarter (sol4); the next one, of zeros, C4 half
// and D4 half.
const DO_MI_SOL = () => inTurn(0.4, 0, 0, 1.5 / 11, 0, 3.5 / 11, 0)
// One note with the dots on: B4 (si4), a dotted quarter; then A4, a dotted quarter.
const SI_DOTTED_QUARTER = () => cycle(6 / 12, 2 / 4, 0.9)
// One note with the dots on: B4 (si4), a plain quarter; then A4, and so on.
const SI_QUARTER = () => cycle(6 / 12, 2 / 4, 0)
// Confident reading in one bar of 4/4 with rests: C4 half, a quarter rest, D4 quarter. Each element
// spends a value on being a rest first.
const DO_REST_RE = () => inTurn(0, 0, 0, 0.3, 0.9, 0.4, 0, 0, 0)

interface Setup {
  random?: Random
  questionLength?: QuestionLength
  dots?: boolean
  askDuration?: boolean
  rests?: boolean
  locale?: Locale
  naming?: NoteNaming
  showAnswerAtOnce?: boolean
}

const TEXTS = {
  en: { noLimit: 'No limit', check: 'Check' },
  ru: { noLimit: 'Без ограничения', check: 'Проверить' },
  es: { noLimit: 'Sin límite', check: 'Comprobar' },
} as const

function storageWith(setUp: (preferences: Preferences) => void): KeyValueStorage {
  const storage = createMemoryStorage()
  setUp(createPreferences(storage, ['en']))
  return storage
}

async function startWriting({
  random = DO_MI_SOL(),
  questionLength = 'two-to-four-notes',
  dots = false,
  askDuration = true,
  rests = false,
  locale = 'en',
  naming,
  showAnswerAtOnce = false,
}: Setup = {}) {
  const storage = storageWith((preferences) => {
    preferences.chooseExercise('write')
    preferences.choosePreset('confident-reading')
    preferences.customize({ questionLength })
    if (!rests) preferences.customize({ timeSignature: { beats: 3, beatValue: 4 }, on: false })
    preferences.customize({ dots })
    preferences.customize({ rests })
    preferences.customize({ keySignatures: 0 })
    preferences.customize({ accidentals: 'none' })
    if (!askDuration) preferences.customize({ askDuration })
    if (naming) preferences.chooseNoteNaming(naming)
    if (showAnswerAtOnce) preferences.chooseShowAnswerAtOnce(true)
  })
  renderSessionWith({
    random,
    clock: createManualClock().clock,
    preferences: preferencesFor([locale], storage),
  })
  await chooseLength(TEXTS[locale].noLimit)
}

// Confident reading as it is, rests and 3/4 included, for the question with a rest.
async function startWritingWithRests() {
  const storage = storageWith((preferences) => {
    preferences.chooseExercise('write')
    preferences.choosePreset('confident-reading')
  })
  renderSessionWith({
    random: DO_REST_RE(),
    clock: createManualClock().clock,
    preferences: preferencesFor(['en'], storage),
  })
  await chooseLength('No limit')
}

const button = (name: string) => screen.getByRole<HTMLButtonElement>('button', { name })
const queryButton = (name: string) => screen.queryByRole('button', { name })
const press = (name: string) => fireEvent.click(button(name))
const column = (number: number) => screen.getByRole('slider', { name: `Note ${number}` })
const columns = () => screen.queryAllByRole('slider')
const written = (number: number) => column(number).getAttribute('aria-valuetext')
const currentColumn = () =>
  columns()
    .filter((each) => each.getAttribute('aria-current') === 'true')
    .map((each) => each.getAttribute('aria-label'))
const staff = () => screen.getByRole('img', { name: 'Music staff' })
const drawn = () => staff().getAttribute('data-drawn')
const drawnDurations = () => staff().getAttribute('data-drawn-durations')
const status = statusText
const isPressed = (name: string) => button(name).getAttribute('aria-pressed') === 'true'

async function touch(number: number, y: number) {
  await fireEvent.click(column(number), { clientX: 180, clientY: y })
}

async function key(number: number, key: string) {
  column(number).focus()
  await fireEvent.keyDown(column(number), { key })
}

async function check(name = 'Check') {
  await press(name)
}

function description(element: HTMLElement): string {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
    .join(' ')
    .trim()
}

const normalized = (text: string | null | undefined) => text?.replace(/\s+/g, ' ').trim() ?? ''

// The element whose whole text is the given one, however it is split between tags.
const byWholeText = (text: string) => (_: string, element: Element | null) =>
  normalized(element?.textContent) === text &&
  [...(element?.children ?? [])].every((child) => normalized(child.textContent) !== text)

const task = (text: string) => screen.queryByText(byWholeText(text))

// The marked note of the task, without the separator after it.
const currentTaskNote = () =>
  [...document.querySelectorAll('[aria-current]:not([aria-current="false"])')]
    .filter((element) => element.getAttribute('role') !== 'slider')
    .map((element) => normalized(element.textContent).replace(/;$/, ''))

const DURATION_BUTTONS = ['Whole note', 'Half note', 'Quarter note', 'Eighth note']

// C4 half, E4 quarter and G4 quarter, each written by a touch in its column and its duration.
async function writeRight() {
  await touch(1, AT.C4)
  await press('Half note')
  await touch(2, AT.E4)
  await press('Quarter note')
  await touch(3, AT.G4)
  await press('Quarter note')
}

// Note 1 with a quarter instead of a half, note 2 on F4 instead of E4, note 3 right.
async function writeTwoPartsWrong() {
  await touch(1, AT.C4)
  await press('Quarter note')
  await touch(2, AT.F4)
  await press('Quarter note')
  await touch(3, AT.G4)
  await press('Quarter note')
}

describe('the task', () => {
  it('names every note in order with its duration, separated by semicolons', async () => {
    await startWriting()

    expect(task('do4, half note; mi4, quarter note; sol4, quarter note')).not.toBeNull()
  })

  it('marks the current note of the task, the first one first', async () => {
    await startWriting()

    expect(currentTaskNote()).toEqual(['do4, half note'])
  })

  it('moves the mark with the current note', async () => {
    await startWriting()

    await press('Next note')

    expect(currentTaskNote()).toEqual(['mi4, quarter note'])
  })

  it('names the notes alone when the duration is not asked', async () => {
    await startWriting({ askDuration: false })

    expect(task('do4; mi4; sol4')).not.toBeNull()
  })

  it('names a dotted duration', async () => {
    await startWriting({ questionLength: 'one-note', dots: true, random: SI_DOTTED_QUARTER() })

    expect(task('si4, dotted quarter note')).not.toBeNull()
  })

  it.each([
    ['ru', 'cyrillic-syllable', 'до4, половинная; ми4, четверть; соль4, четверть'],
    ['es', 'latin-syllable', 'do4, blanca; mi4, negra; sol4, negra'],
  ] as const)('is said in %s', async (locale, naming, text) => {
    await startWriting({ locale, naming })

    expect(task(text)).not.toBeNull()
  })

  it.each([
    ['ru', 'cyrillic-syllable', 'соль4, половинная с точкой'],
    ['es', 'latin-syllable', 'sol4, blanca con puntillo'],
  ] as const)('names a dotted half note in %s', async (locale, naming, text) => {
    // G4, a dotted half: the 5th of twelve, the 2nd of four durations, a dot.
    await startWriting({
      locale,
      naming,
      questionLength: 'one-note',
      dots: true,
      random: cycle(4 / 12, 1 / 4, 0.9),
    })

    expect(task(text)).not.toBeNull()
  })
})

describe('the columns', () => {
  it('has a column for each note, the first one current', async () => {
    await startWriting()

    expect(columns().map((each) => each.getAttribute('aria-label'))).toEqual([
      'Note 1',
      'Note 2',
      'Note 3',
    ])
    expect(currentColumn()).toEqual(['Note 1'])
    expect(written(2)).toBe('No note yet')
  })

  it('has no column for a rest, which is drawn already', async () => {
    await startWritingWithRests()

    expect(staff().getAttribute('data-elements')).toBe('C4/half rest/quarter D4/quarter')
    expect(columns().map((each) => each.getAttribute('aria-label'))).toEqual(['Note 1', 'Note 2'])
    expect(task('do4, half note; re4, quarter note')).not.toBeNull()
  })

  it('writes the touched note and makes it current', async () => {
    await startWriting()

    await touch(2, AT.E4)

    expect(written(2)).toBe('mi4')
    expect(written(1)).toBe('No note yet')
    expect(currentColumn()).toEqual(['Note 2'])
    expect(drawn()).toBe('- E4 -')
  })

  it('stays on a written note: writing it does not move on', async () => {
    await startWriting()

    await touch(1, AT.C4)
    await press('Half note')

    expect(currentColumn()).toEqual(['Note 1'])
  })

  it('moves the current note with One step up and One step down', async () => {
    await startWriting()
    await touch(1, AT.C4)
    await touch(3, AT.G4)

    await press('One step up')

    expect(written(3)).toBe('la4')
    expect(written(1)).toBe('do4')
  })

  it('changes a written note before the check', async () => {
    await startWriting()
    await touch(1, AT.E4)
    await touch(2, AT.E4)

    await touch(1, AT.C4)

    expect(written(1)).toBe('do4')
    expect(currentColumn()).toEqual(['Note 1'])
  })
})

describe('moving between the notes', () => {
  it('goes on and back with Next note and Previous note', async () => {
    await startWriting()

    await press('Next note')
    expect(currentColumn()).toEqual(['Note 2'])

    await press('Previous note')
    expect(currentColumn()).toEqual(['Note 1'])
  })

  it('disables Previous note on the first note and Next note on the last', async () => {
    await startWriting()

    expect(button('Previous note').disabled).toBe(true)
    expect(button('Next note').disabled).toBe(false)

    await press('Next note')
    await press('Next note')
    expect(button('Next note').disabled).toBe(true)
  })

  it('goes on and back with the arrow keys right and left on a column, the focus following', async () => {
    await startWriting()

    await key(1, 'ArrowRight')
    expect(currentColumn()).toEqual(['Note 2'])
    await waitFor(() => expect(document.activeElement).toBe(column(2)))

    await key(2, 'ArrowLeft')
    expect(currentColumn()).toEqual(['Note 1'])
    await waitFor(() => expect(document.activeElement).toBe(column(1)))
  })

  it('moves the current note with the arrow keys up and down', async () => {
    await startWriting()
    await key(1, 'ArrowRight')

    // The middle of the twelve steps C4–G5: A4.
    await key(2, 'ArrowUp')

    expect(written(2)).toBe('la4')
    expect(written(1)).toBe('No note yet')
  })
})

describe('the row of durations', () => {
  it('offers the durations of the difficulty, named by the duration', async () => {
    await startWriting()

    for (const name of DURATION_BUTTONS) expect(isPressed(name)).toBe(false)
    expect(queryButton('Sixteenth note')).toBeNull()
  })

  it('shows the shape of a note, not a fraction', async () => {
    await startWriting()

    for (const name of DURATION_BUTTONS) expect(button(name).textContent).not.toMatch(/\d\/\d/)
    expect(queryButton('1/4')).toBeNull()
  })

  it('offers no dot without the dots, and Dot with them', async () => {
    await startWriting()
    expect(queryButton('Dot')).toBeNull()
    cleanup()

    await startWriting({ questionLength: 'one-note', dots: true, random: SI_QUARTER() })
    expect(queryButton('Dot')).not.toBeNull()
  })

  it('is not there when the duration is not asked', async () => {
    await startWriting({ askDuration: false })

    for (const name of DURATION_BUTTONS) expect(queryButton(name)).toBeNull()
  })

  it('chooses the duration of the current note', async () => {
    await startWriting()
    await touch(2, AT.E4)

    await press('Quarter note')

    expect(isPressed('Quarter note')).toBe(true)
    await press('Previous note')
    expect(isPressed('Quarter note')).toBe(false)
  })

  it('draws a written note as a black head until its duration is chosen, then with it', async () => {
    await startWriting()
    await touch(1, AT.C4)
    expect(drawnDurations()).toBe('head - -')

    await press('Half note')

    expect(drawnDurations()).toBe('half - -')
  })

  it('draws the dotted duration with Dot', async () => {
    await startWriting({ questionLength: 'one-note', dots: true, random: SI_DOTTED_QUARTER() })
    await touch(1, AT.B4)

    await press('Dot')
    await press('Quarter note')

    expect(isPressed('Dot')).toBe(true)
    expect(drawnDurations()).toBe('quarter.')
  })

  it('draws a written note with the duration of the question when it is not asked', async () => {
    await startWriting({ askDuration: false })

    await touch(1, AT.D4)

    expect(drawn()).toBe('D4 - -')
    expect(drawnDurations()).toBe('half - -')
  })
})

describe('checking', () => {
  it('asks to answer every note before all are written', async () => {
    await startWriting()
    await touch(1, AT.C4)
    await press('Half note')

    await check()

    expect(status()).toBe('Answer every note')
    expect(queryButton('Next')).toBeNull()
  })

  it('asks to answer every note when a duration is missing', async () => {
    await startWriting()
    await touch(1, AT.C4)
    await press('Half note')
    await touch(2, AT.E4)
    await touch(3, AT.G4)
    await press('Quarter note')

    await check()

    expect(status()).toBe('Answer every note')
    expect(queryButton('Next')).toBeNull()
  })

  it('asks for the duration of one note written without it', async () => {
    await startWriting({ questionLength: 'one-note', random: SI_QUARTER() })
    await touch(1, AT.B4)

    await check()

    expect(status()).toBe('Choose a duration first')
  })

  it.each([
    ['ru', 'Сначала выберите длительность', 'Проверить'],
    ['es', 'Primero elige la duración', 'Comprobar'],
  ] as const)('asks for the duration in %s', async (locale, text, name) => {
    await startWriting({ locale, questionLength: 'one-note', random: SI_QUARTER() })
    await fireEvent.click(screen.getAllByRole('slider')[0] as HTMLElement, {
      clientX: 180,
      clientY: AT.B4,
    })

    await check(name)

    expect(status()).toBe(text)
  })

  it('says Correct for every note right and counts two points a note', async () => {
    await startWriting()
    await writeRight()

    await check()

    expect(status()).toBe('Correct')
    expect(screen.getByText('Points: 6 of 6')).not.toBeNull()
  })

  it('checks with Enter on a column', async () => {
    await startWriting()
    await writeRight()

    await key(3, 'Enter')

    expect(status()).toBe('Correct')
  })
})

describe('a wrong part', () => {
  it('gives a second try on the wrong notes, marked, starting on the first one', async () => {
    await startWriting()
    await writeTwoPartsWrong()

    await check()

    expect(status()).toBe('Incorrect. Try again.')
    expect(description(column(1))).toBe('Incorrect')
    expect(description(column(2))).toBe('Incorrect')
    expect(description(column(3))).toBe('')
    expect(currentColumn()).toEqual(['Note 1'])
    expect(screen.getByText('Points: 4 of 6')).not.toBeNull()
  })

  it('clears the wrong duration and refuses it, marked as incorrect', async () => {
    await startWriting()
    await writeTwoPartsWrong()

    await check()

    expect(isPressed('Quarter note')).toBe(false)
    expect(button('Quarter note').disabled).toBe(true)
    expect(description(button('Quarter note'))).toBe('Incorrect')
    expect(drawnDurations()).toBe('head quarter quarter')
  })

  it('keeps the right step of a note with a wrong duration, the column not moving', async () => {
    await startWriting()
    await writeTwoPartsWrong()
    await check()

    await touch(1, AT.A4)
    await press('One step up')

    expect(written(1)).toBe('do4')
  })

  it('keeps the right duration of a note with a wrong step', async () => {
    await startWriting()
    await writeTwoPartsWrong()
    await check()

    await press('Next note')

    expect(currentColumn()).toEqual(['Note 2'])
    expect(isPressed('Quarter note')).toBe(true)
    expect(button('Half note').disabled).toBe(true)
  })

  it('leaves a note right on the first attempt as it is, its column not taking a touch', async () => {
    await startWriting()
    await writeTwoPartsWrong()
    await check()

    await touch(3, AT.C5)

    expect(written(3)).toBe('sol4')
    expect(currentColumn()).toEqual(['Note 1'])
    expect(button('Next note').disabled).toBe(false)
    await press('Next note')
    expect(button('Next note').disabled).toBe(true)
  })

  it('asks to move a note still on its rejected step', async () => {
    await startWriting()
    await writeTwoPartsWrong()
    await check()
    await press('Half note')

    await check()

    expect(status()).toBe('Move the note to another place first')
  })

  it('says Correct on the second try once the wrong parts are right', async () => {
    await startWriting()
    await writeTwoPartsWrong()
    await check()

    await press('Half note')
    await touch(2, AT.E4)
    await check()

    expect(status()).toBe('Correct on the second try')
    expect(screen.getByText('Points: 4 of 6')).not.toBeNull()
  })

  it('explains every part still wrong under the number of its note and draws the right notes', async () => {
    await startWriting()
    await writeTwoPartsWrong()
    await check()

    await press('Eighth note')
    await touch(2, AT.D4)
    await check()

    expect(status()).toBe(
      'Note 1: You wrote an eighth note. This note is a half note. ' +
        'Note 2: You wrote re4. The note mi4 is on the 1st line.',
    )
    expect(drawn()).toBe('C4 E4 G4')
    expect(drawnDurations()).toBe('half quarter quarter')
  })

  it('explains the parts at once with Show the right answer at once', async () => {
    await startWriting({ showAnswerAtOnce: true })
    await writeTwoPartsWrong()

    await check()

    expect(status()).toBe(
      'Note 1: You wrote a quarter note. This note is a half note. ' +
        'Note 2: You wrote fa4. The note mi4 is on the 1st line.',
    )
  })

  // As in M1: on the review the chosen wrong duration is marked incorrect, the right one correct.
  it('marks the wrong duration incorrect and the right one correct on the review', async () => {
    await startWriting({
      questionLength: 'one-note',
      random: SI_QUARTER(),
      showAnswerAtOnce: true,
    })
    await touch(1, AT.B4)
    await press('Eighth note')

    await check()

    expect(description(button('Eighth note'))).toBe('Incorrect')
    expect(description(button('Quarter note'))).toBe('Correct')
    expect(description(button('Half note'))).toBe('')
  })

  it('gives each sentence a Why?, the duration one opening the hint on durations', async () => {
    await startWriting({ showAnswerAtOnce: true })
    await writeTwoPartsWrong()
    await check()

    const whys = screen.getAllByRole('button', { name: 'Why?' })
    expect(whys).toHaveLength(2)
    await fireEvent.click(whys[0] as HTMLElement)

    expect(
      await screen.findByRole('dialog', { name: 'Durations of notes and rests' }),
    ).not.toBeNull()
  })

  it.each([
    [
      'ru',
      'cyrillic-syllable',
      'Нота 1: Вы написали четверть. Эта нота — половинная. ' +
        'Нота 2: Вы написали фа4. Нота ми4 — на первой линейке.',
    ],
    [
      'es',
      'latin-syllable',
      'Nota 1: Escribiste una negra. Esta nota es una blanca. ' +
        'Nota 2: Escribiste fa4. La nota mi4 está en la primera línea.',
    ],
  ] as const)('explains the parts in %s', async (locale, naming, text) => {
    await startWriting({ locale, naming, showAnswerAtOnce: true })
    const quarter = locale === 'ru' ? 'Четверть' : 'Negra'
    const slider = (index: number) => screen.getAllByRole('slider')[index] as HTMLElement
    await fireEvent.click(slider(0), { clientX: 180, clientY: AT.C4 })
    await press(quarter)
    await fireEvent.click(slider(1), { clientX: 180, clientY: AT.F4 })
    await press(quarter)
    await fireEvent.click(slider(2), { clientX: 180, clientY: AT.G4 })
    await press(quarter)

    await check(TEXTS[locale].check)

    expect(status()).toBe(text)
  })
})

// Criterion 10: the quick mode only drops the pause.
describe('several notes in the quick mode', () => {
  const quickMode = () =>
    fireEvent.click(screen.getByRole('checkbox', { name: 'Open next question automatically' }))

  it('does not check by itself once every part is written', async () => {
    await startWriting()
    await quickMode()

    await writeRight()

    expect(status()).toBe('')
    expect(queryButton('Check')).not.toBeNull()
  })

  it('opens the next question at once after a right check', async () => {
    await startWriting()
    await quickMode()
    await writeRight()

    await check()

    expect(status()).toBe('Correct')
    expect(task('do4, half note; re4, half note')).not.toBeNull()
    expect(drawn()).toBe('- -')
  })
})
