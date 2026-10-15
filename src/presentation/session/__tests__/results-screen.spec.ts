import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/vue'
import type { KeyValueStorage, Random } from '@/application/ports'
import { createPreferences } from '@/application/preferences'
import type { Locale } from '@/domain/language'
import { LETTERS } from '@/domain/pitch'
import { forgetDialogs } from '@/presentation/__tests__/dialog'
import {
  chooseShownDuration,
  createManualClock,
  createMemoryStorage,
  failStaffLoading,
  mistakeLine,
  NAMES,
  preferencesFor,
  renderSessionWith,
  resultStats,
  startingOnC4,
  startSession,
  storageWithOneNoteReading,
  type ManualClock,
} from '@/presentation/__tests__/screen'

// Feature design-system, slice 5, criterion 16 and edge case 3: the results built of the design
// system. What they count and what their buttons and links do stay as they were; how they show it
// changes:
//
// - The heading Results, then the accuracy large, "75%", the points beside it, "3 of 4 points".
// - The other figures are tiles in a list of descriptions: Questions, Best streak, Average time,
//   each a label, the term, and a value, the definition; the sentences "Questions: 10" and the like
//   are gone.
// - Most mistakes is a heading of the second level. Each line of its list shows the note of its item
//   on a small staff, the clef only, with no time signature and no key signature: the sign of the
//   item stands before its note. The staff is for the eye: the text of the line names the note, so
//   a screen reader hears no image there. Then the item in bold, "do4, whole note", its count below
//   it, "1 mistake", and the links to the wiki as before. A staff that fails to load leaves the
//   line without it.
// - Practice only these is the primary button, New session the secondary one, both as wide as the
//   column; without mistakes New session is the primary one.
//
// The staff stub gives the notes it received: see presentation/__tests__/screen.ts. The screen runs
// in Confident reading with one note in 4/4 unless told otherwise; questions start on C4 (do), a
// whole note, then D4 (re), C4… while no item of the review queue comes back.

afterEach(() => {
  cleanup()
  forgetDialogs()
  vi.restoreAllMocks()
})

const NBSP = ' '

const TEXTS = {
  en: {
    results: 'Results',
    heading: 'Most mistakes',
    noLimit: 'No limit',
    check: 'Check',
    next: 'Next',
    finish: 'Finish',
    practice: 'Practice only these',
    newSession: 'New session',
  },
  ru: {
    results: 'Результаты',
    heading: 'Больше всего ошибок',
    noLimit: 'Без ограничения',
    check: 'Проверить',
    next: 'Далее',
    finish: 'Завершить',
    practice: 'Потренировать только их',
    newSession: 'Новая сессия',
  },
  es: {
    results: 'Resultados',
    heading: 'Más errores',
    noLimit: 'Sin límite',
    check: 'Comprobar',
    next: 'Siguiente',
    finish: 'Terminar',
    practice: 'Practicar solo estos',
    newSession: 'Nueva sesión',
  },
} as const satisfies Record<Locale, Record<string, string>>

type Texts = (typeof TEXTS)[Locale]
const EN = TEXTS.en

const button = (name: string) => screen.getByRole('button', { name })
const queryButton = (name: string) => screen.queryByRole('button', { name })
const press = (name: string) => fireEvent.click(button(name))
const shownPitch = () => document.querySelector('[data-pitch]')?.getAttribute('data-pitch')
// The default normalizer would turn the non-breaking space of "75 %" into a plain one.
const exactText = (text: string) => screen.queryByText(text, { normalizer: (raw) => raw.trim() })
const follows = (earlier: Element, later: Element) =>
  (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

function items(name: string = EN.heading): HTMLElement[] {
  const list = screen.queryByRole('list', { name })
  if (!list) throw new Error(`no list named ${name}`)
  return within(list).getAllByRole('listitem')
}

// The staff of a line, as the stub received it; null without one.
const staffOf = (item: HTMLElement) => item.querySelector<HTMLElement>('[data-elements]')

function staffNotes(item: HTMLElement) {
  const staff = staffOf(item)
  if (!staff) throw new Error('no staff in the line')
  return {
    elements: staff.getAttribute('data-elements'),
    signs: staff.getAttribute('data-signs'),
    keySignature: staff.getAttribute('data-key-signature'),
    timeSignature: staff.getAttribute('data-time-signature'),
  }
}

interface Setup {
  readonly random?: Random
  readonly locale?: Locale
  readonly storage?: KeyValueStorage
  readonly clock?: ManualClock
  // The note name buttons in the naming of the storage.
  readonly names?: readonly string[]
}

async function start(setup: Setup = {}) {
  const {
    random = startingOnC4(),
    locale = 'en',
    storage = storageWithOneNoteReading(),
    clock = createManualClock(),
  } = setup
  names = setup.names ?? NAMES
  renderSessionWith({
    random,
    clock: clock.clock,
    timer: clock.timer,
    preferences: preferencesFor([locale], storage),
  })
  await startSession(TEXTS[locale].noLimit)
  return clock
}

// The note name buttons from do to si; Russian here names them by Cyrillic syllables.
const CYRILLIC = ['до', 'ре', 'ми', 'фа', 'соль', 'ля', 'си']
let names: readonly string[] = NAMES

// One note in Confident reading here: no signs, so the pitch is a letter and an octave.
function rightName(): string {
  const letter = shownPitch()?.charAt(0)
  const name = names[LETTERS.findIndex((each) => each === letter)]
  if (!name) throw new Error(`no note name for ${letter}`)
  return name
}

async function answerRight(texts: Texts = EN) {
  await press(rightName())
  await chooseShownDuration()
  await press(texts.check)
}

// The name wrong in both attempts, the duration right: 1 point of 2.
async function answerWrong(texts: Texts = EN) {
  const [first, second] = names.filter((name) => name !== rightName())
  if (!first || !second) throw new Error('not enough wrong names')
  await press(first)
  await chooseShownDuration()
  await press(texts.check)
  await press(second)
  await press(texts.check)
}

// C4 wrong, D4 right: 3 points of 4, 75%; a best streak of 1; do4 with one mistake. With a clock,
// the answers take 2.0 and 2.8 s: 2.4 s on average.
async function wrongThenRight(texts: Texts = EN, clock?: ManualClock) {
  await clock?.elapse(2000)
  await answerWrong(texts)
  await press(texts.next)
  await clock?.elapse(2800)
  await answerRight(texts)
  await press(texts.finish)
}

// C4 wrong, D4 wrong: re4, then do4, each with one mistake.
async function twoWrong() {
  await answerWrong()
  await press(EN.next)
  await answerWrong()
  await press(EN.finish)
}

describe('the results by the design system', () => {
  describe('the heading', () => {
    it('is the heading Results of the first level, with the focus', async () => {
      await start()
      await wrongThenRight()

      const heading = screen.getByRole('heading', { level: 1, name: EN.results })
      await waitFor(() => expect(document.activeElement).toBe(heading))
    })
  })

  describe('the accuracy', () => {
    it('stands large as a percent, "75%", with "3 of 4 points" beside it', async () => {
      await start()
      await wrongThenRight()

      expect(exactText('75%')).not.toBeNull()
      expect(exactText('3 of 4 points')).not.toBeNull()
    })

    it('follows the heading and stands before the figures', async () => {
      await start()
      await wrongThenRight()

      const heading = screen.getByRole('heading', { level: 1, name: EN.results })
      const percent = exactText('75%') as HTMLElement
      const points = exactText('3 of 4 points') as HTMLElement
      const [firstTerm] = screen.getAllByRole('term')
      expect(follows(heading, percent)).toBe(true)
      expect(follows(percent, points)).toBe(true)
      expect(follows(points, firstTerm as HTMLElement)).toBe(true)
    })

    it('is no longer said as a sentence', async () => {
      await start()
      await wrongThenRight()

      expect(screen.queryByText(/^Accuracy/)).toBeNull()
    })

    it.each([
      ['ru', `75${NBSP}%`, '3 из 4 баллов'],
      ['es', `75${NBSP}%`, '3 de 4 puntos'],
    ] as const)('says it in %s: "%s", "%s"', async (locale, percent, points) => {
      await start({ locale })
      await wrongThenRight(TEXTS[locale])

      expect(exactText(percent)).not.toBeNull()
      expect(exactText(points)).not.toBeNull()
    })

    // One note written right with no duration asked earns 1 point of 1.
    it.each([
      ['en', '1 of 1 point'],
      ['ru', '1 из 1 балла'],
      ['es', '1 de 1 punto'],
    ] as const)('says one point of one in %s: "%s"', async (locale, points) => {
      layOutAsOnePhone()
      await start({ locale, storage: writingWithSigns(), random: fInGMajor() })
      await touchF4()
      await press(TEXTS[locale].check)
      await press(TEXTS[locale].finish)

      expect(exactText(points)).not.toBeNull()
      expect(exactText(locale === 'en' ? '100%' : `100${NBSP}%`)).not.toBeNull()
    })
  })

  describe('the figures', () => {
    it('are tiles, each a label with its value: Questions, Best streak, Average time', async () => {
      const clock = await start()
      await wrongThenRight(EN, clock)

      expect(Object.entries(resultStats())).toEqual([
        ['Questions', '2'],
        ['Best streak', '1'],
        ['Average time', `2.4${NBSP}s`],
      ])
    })

    it('stand in one list of descriptions', async () => {
      await start()
      await wrongThenRight()

      const terms = screen.getAllByRole('term')
      const lists = new Set(terms.map((term) => term.closest('dl')))
      expect(terms).toHaveLength(3)
      expect(lists.size).toBe(1)
      expect([...lists][0]).toBeInstanceOf(HTMLDListElement)
    })

    it('are no longer said as sentences', async () => {
      await start()
      await wrongThenRight()

      for (const sentence of [/^Questions:/, /^Best streak:/, /^Average time:/]) {
        expect(screen.queryByText(sentence)).toBeNull()
      }
    })

    it.each([
      [
        'ru',
        [
          ['Вопросов', '2'],
          ['Лучшая серия', '1'],
          ['Среднее время', `2,4${NBSP}с`],
        ],
      ],
      [
        'es',
        [
          ['Preguntas', '2'],
          ['Mejor racha', '1'],
          ['Tiempo medio', `2,4${NBSP}s`],
        ],
      ],
    ] as const)('label them in %s', async (locale, stats) => {
      const clock = await start({ locale })
      await wrongThenRight(TEXTS[locale], clock)

      expect(Object.entries(resultStats())).toEqual(stats)
    })
  })

  describe('Most mistakes', () => {
    it('is a heading of the second level above the list', async () => {
      await start()
      await wrongThenRight()

      const heading = screen.getByRole('heading', { level: 2, name: EN.heading })
      const [item] = items()
      expect(follows(heading, item as HTMLElement)).toBe(true)
    })

    it('gives the item in bold apart from its count: "do4, whole note", "1 mistake"', async () => {
      await start()
      await wrongThenRight()

      const [item] = items()
      expect(mistakeLine(item as HTMLElement)).toBe('do4, whole note / 1 mistake')
      expect(within(item as HTMLElement).getByText('do4, whole note')).toBeTruthy()
    })

    it('shows the note of each line on its own staff, the clef only', async () => {
      await start()
      await twoWrong()

      expect(items().map(staffNotes)).toEqual([
        { elements: 'D4/whole', signs: '-', keySignature: 'none', timeSignature: 'none' },
        { elements: 'C4/whole', signs: '-', keySignature: 'none', timeSignature: 'none' },
      ])
    })

    it('puts the staff before the text of the line', async () => {
      await start()
      await wrongThenRight()

      const [item] = items() as [HTMLElement]
      const staff = staffOf(item) as HTMLElement
      expect(follows(staff, within(item).getByText('do4, whole note'))).toBe(true)
    })

    it('gives the staff for the eye only: the text of the line names the note', async () => {
      await start()
      await twoWrong()

      for (const item of items()) {
        expect(staffOf(item)).not.toBeNull()
        expect(within(item).queryAllByRole('img')).toEqual([])
      }
    })

    it('draws the sign of the item before its note, with no key signature: F♯4, a quarter', async () => {
      await start({ storage: oneNoteWithSigns(), random: faSharp() })
      for (const name of ['Flat', 'sol', '1/2', EN.check]) await press(name)

      await press(EN.finish)

      const [item] = items() as [HTMLElement]
      expect(mistakeLine(item)).toBe('fa♯4, quarter note / 1 mistake')
      expect(staffNotes(item)).toEqual({
        elements: 'F#4/quarter',
        signs: 'sharp',
        keySignature: 'none',
        timeSignature: 'none',
      })
    })

    it('draws the sharp of a key signature before the note in Write notes', async () => {
      layOutAsOnePhone()
      await start({ storage: writingWithSigns(), random: fInGMajor() })
      await touchF4()
      await press('Sharp')
      await press(EN.check)

      await press(EN.finish)

      const [item] = items() as [HTMLElement]
      expect(staffNotes(item)).toEqual({
        elements: 'F#4/whole',
        signs: 'sharp',
        keySignature: 'none',
        timeSignature: 'none',
      })
    })

    it('keeps the links of the line to the wiki after its text', async () => {
      await start()
      await wrongThenRight()

      const [item] = items() as [HTMLElement]
      const link = within(item).getByRole('link', { name: 'Notes on the treble staff' })
      expect(follows(within(item).getByText('1 mistake'), link)).toBe(true)
    })

    it('leaves the line without its staff when the staff fails to load', async () => {
      await start()
      await wrongThenRight()

      failStaffLoading()
      await waitFor(() => expect(staffOf(items()[0] as HTMLElement)).toBeNull())

      const [item] = items() as [HTMLElement]
      expect(mistakeLine(item)).toBe('do4, whole note / 1 mistake')
      expect(within(item).getByRole('link', { name: 'Notes on the treble staff' })).toBeTruthy()
    })

    it.each([
      ['ru', 'до4, целая / 1 ошибка'],
      ['es', 'do4, redonda / 1 error'],
    ] as const)('says the line in %s: "%s"', async (locale, line) => {
      const storage = storageWithOneNoteReading()
      if (locale === 'ru') createPreferences(storage, ['ru']).chooseNoteNaming('cyrillic-syllable')
      await start({ locale, storage, names: locale === 'ru' ? CYRILLIC : NAMES })
      await wrongThenRight(TEXTS[locale])

      const [item] = items(TEXTS[locale].heading) as [HTMLElement]
      expect(mistakeLine(item)).toBe(line)
    })
  })

  describe('the buttons', () => {
    const classesOf = (name: string) => [...button(name).classList]
    const primaries = () =>
      screen.getAllByRole('button').filter((each) => each.classList.contains('primary'))

    it('make Practice only these the primary button and New session the secondary one', async () => {
      await start()
      await wrongThenRight()

      expect(classesOf(EN.practice)).toEqual(
        expect.arrayContaining(['ui-button', 'primary', 'block']),
      )
      expect(classesOf(EN.newSession)).toEqual(
        expect.arrayContaining(['ui-button', 'secondary', 'block']),
      )
      expect(primaries()).toEqual([button(EN.practice)])
    })

    it('put Practice only these before New session, below the list', async () => {
      await start()
      await wrongThenRight()

      const [item] = items() as [HTMLElement]
      expect(follows(item, button(EN.practice))).toBe(true)
      expect(follows(button(EN.practice), button(EN.newSession))).toBe(true)
    })

    it('make New session the primary button without mistakes', async () => {
      await start()
      await answerRight()
      await press(EN.finish)

      expect(queryButton(EN.practice)).toBeNull()
      expect(classesOf(EN.newSession)).toEqual(
        expect.arrayContaining(['ui-button', 'primary', 'block']),
      )
      expect(primaries()).toEqual([button(EN.newSession)])
    })
  })
})

// As in most-mistakes.spec.ts: Confident reading with one note in 4/4, with sharps and flats, the
// right answer shown at once.
function oneNoteWithSigns(): KeyValueStorage {
  const storage = createMemoryStorage()
  const preferences = createPreferences(storage, ['en'])
  preferences.choosePreset('confident-reading')
  preferences.customize({ questionLength: 'one-note' })
  preferences.customize({ timeSignature: { beats: 3, beatValue: 4 }, on: false })
  preferences.customize({ keySignatures: 0 })
  preferences.customize({ accidentals: 'sharp-and-flat' })
  preferences.chooseShowAnswerAtOnce(true)
  return storage
}

// F4, a quarter, with a sharp before it: fa♯ in the 1st space; then plain whole notes.
function faSharp(): Random {
  const queue = [3.5 / 12, 0.5, 0.9, 0]
  return { next: () => queue.shift() ?? 0 }
}

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

// jsdom lays nothing out, so every element is a box 360 wide and 100 high at the top of the page;
// the staff lines of the stub run from y = 30 down to y = 70, a step 5: F4 at 65.
function layOutAsOnePhone() {
  const box = { x: 0, y: 0, top: 0, left: 0, width: 360, height: 100, right: 360, bottom: 100 }
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    ...box,
    toJSON: () => box,
  } as DOMRect)
}

async function touchF4() {
  const column = screen.getAllByRole('slider')[0] as HTMLElement
  await fireEvent.click(column, { clientX: 180, clientY: 65 })
}
