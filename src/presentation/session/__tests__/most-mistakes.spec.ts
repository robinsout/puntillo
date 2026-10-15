import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import type { KeyValueStorage, Random } from '@/application/ports'
import { createPreferences } from '@/application/preferences'
import type { Locale } from '@/domain/language'
import type { NoteNaming } from '@/domain/naming'
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
  type ManualClock,
  mistakeLine,
} from '@/presentation/__tests__/screen'

// Feature session-summary, slice 2: Most mistakes in the results (criteria 6–9, 13; edge cases 5
// and 6 in part, the sizes being the end-to-end tests').
//
// - Below the general figures of the results, a list "Most mistakes" of up to five items, each a
//   pitch as written and a duration wrong in a first attempt: "F♯4, quarter note — 3 mistakes",
//   the name in the naming of the user, "1 mistake" for one.
// - The items with more mistakes come first; of two with as many, the later mistake first.
// - Each item links to the articles of the wiki on the kinds of its mistakes, the topics of the
//   Why? buttons of the review; the links are named by the titles of the articles. (Opening them
//   and Back to the results: presentation/wiki/__tests__/results-articles.spec.ts.)
// - Without mistakes, "No mistakes" in place of the list.
// - Read notes and Write notes alike, a sign one too many in Write notes included; every length,
//   on time and with Finish too.
//
// The list is named by its heading, Most mistakes. The text of an item is that of the list item
// without its staff and its links; feature design-system, slice 5, gives the item and its count
// apart: "do4, whole note / 1 mistake". The screen runs in Confident reading with one note in 4/4 unless told
// otherwise; questions start on C4 (do), a whole note, then D4 (re), C4… while no item of the
// review queue comes back; the answers read the shown note, so they hold whatever comes.

afterEach(() => {
  cleanup()
  forgetDialogs()
  vi.restoreAllMocks()
})

const MINUTE = 60_000

const TEXTS = {
  en: {
    heading: 'Most mistakes',
    none: 'No mistakes',
    noLimit: 'No limit',
    check: 'Check',
    next: 'Next',
    finish: 'Finish',
    staff: 'Notes on the treble staff',
  },
  ru: {
    heading: 'Больше всего ошибок',
    none: 'Ошибок нет',
    noLimit: 'Без ограничения',
    check: 'Проверить',
    next: 'Далее',
    finish: 'Завершить',
    staff: 'Ноты на нотоносце в скрипичном ключе',
  },
  es: {
    heading: 'Más errores',
    none: 'Sin errores',
    noLimit: 'Sin límite',
    check: 'Comprobar',
    next: 'Siguiente',
    finish: 'Terminar',
    staff: 'Notas en el pentagrama en clave de sol',
  },
} as const satisfies Record<Locale, Record<string, string>>

const EN = TEXTS.en

const TOPIC_TITLES = {
  staff: 'Notes on the treble staff',
  durations: 'Durations of notes and rests',
  accidentals: 'Sharp, flat and natural',
  keySignatures: 'Key signatures',
} as const

const button = (name: string) => screen.getByRole('button', { name })
const press = (name: string) => fireEvent.click(button(name))
// The staff is named in the language of the interface; its stub gives the notes it received.
const shownPitch = () => document.querySelector('[data-pitch]')?.getAttribute('data-pitch')

const mostMistakes = (name: string = EN.heading) => screen.queryByRole('list', { name })

function items(name: string = EN.heading): HTMLElement[] {
  const list = mostMistakes(name)
  if (!list) throw new Error(`no list named ${name}`)
  return within(list).getAllByRole('listitem')
}

const itemTexts = (name?: string) => items(name).map(mistakeLine)

const linkNames = (item: HTMLElement) =>
  within(item)
    .queryAllByRole('link')
    .map((link) => link.textContent?.replace(/\s+/g, ' ').trim())

interface Setup {
  readonly random?: Random
  readonly locale?: Locale
  readonly storage?: KeyValueStorage
  readonly naming?: NoteNaming
  readonly clock?: ManualClock
}

// The note name buttons from do to si in each naming.
const BUTTON_NAMES: Record<NoteNaming, readonly string[]> = {
  'latin-syllable': NAMES,
  'cyrillic-syllable': ['до', 'ре', 'ми', 'фа', 'соль', 'ля', 'си'],
  letter: ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
}

let names: readonly string[] = NAMES

async function start(length: string = EN.noLimit, setup: Setup = {}) {
  const {
    random = startingOnC4(),
    locale = 'en',
    naming,
    storage = naming ? storageWithNaming(naming) : storageWithOneNoteReading(),
    clock = createManualClock(),
  } = setup
  names = BUTTON_NAMES[naming ?? 'latin-syllable']
  renderSessionWith({
    random,
    clock: clock.clock,
    timer: clock.timer,
    preferences: preferencesFor([locale], storage),
  })
  await startSession(length)
  return clock
}

function storageWithNaming(naming: NoteNaming): KeyValueStorage {
  const storage = storageWithOneNoteReading()
  createPreferences(storage, ['en']).chooseNoteNaming(naming)
  return storage
}

// One note in Confident reading here: no signs, so the pitch is a letter and an octave.
function rightName(): string {
  const letter = shownPitch()?.charAt(0)
  const name = names[LETTERS.findIndex((each) => each === letter)]
  if (!name) throw new Error(`no note name for ${letter}`)
  return name
}

async function answerRight(check: string = EN.check) {
  await press(rightName())
  await chooseShownDuration()
  await press(check)
}

// The name wrong in both attempts, the duration right.
async function answerWrong(check: string = EN.check) {
  const [first, second] = names.filter((name) => name !== rightName())
  if (!first || !second) throw new Error('not enough wrong names')
  await press(first)
  await chooseShownDuration()
  await press(check)
  await press(second)
  await press(check)
}

function expectShown(pitch: string) {
  if (shownPitch() !== pitch) throw new Error(`expected ${pitch} on the staff, got ${shownPitch()}`)
}

// C4 wrong, D4 wrong, C4 wrong: do4 with two mistakes, re4 with one.
async function twoOnC4AndOneOnD4(texts: (typeof TEXTS)[Locale] = EN) {
  expectShown('C4')
  await answerWrong(texts.check)
  await press(texts.next)
  expectShown('D4')
  await answerWrong(texts.check)
  await press(texts.next)
  expectShown('C4')
  await answerWrong(texts.check)
}

describe('Most mistakes in the results', () => {
  describe('without mistakes (criterion 9)', () => {
    it('says "No mistakes" in place of the list', async () => {
      await start()
      await answerRight()

      await press(EN.finish)

      expect(screen.getByText(EN.none)).toBeTruthy()
      expect(mostMistakes()).toBeNull()
      expect(screen.queryAllByRole('link', { name: TOPIC_TITLES.staff })).toEqual([])
    })

    // Decision of the coordinator on slice 2: the heading stays, "No mistakes" below it.
    it('keeps the heading "Most mistakes" with "No mistakes" below it', async () => {
      await start()
      await answerRight()

      await press(EN.finish)

      const heading = screen.getByRole('heading', { name: EN.heading })
      const none = screen.getByText(EN.none)
      expect(heading.compareDocumentPosition(none) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('shows the heading above the list when there are mistakes', async () => {
      await start()
      await answerWrong()

      await press(EN.finish)

      const heading = screen.getByRole('heading', { name: EN.heading })
      const list = mostMistakes()
      expect(list).not.toBeNull()
      expect(
        heading.compareDocumentPosition(list as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    })

    it.each(['ru', 'es'] as const)('says it in %s', async (locale) => {
      const texts = TEXTS[locale]
      await start(texts.noLimit, { locale })
      await answerRight(texts.check)

      await press(texts.finish)

      expect(screen.getByRole('heading', { name: texts.heading })).toBeTruthy()
      expect(screen.getByText(texts.none)).toBeTruthy()
      expect(screen.queryByText(EN.none)).toBeNull()
    })
  })

  describe('the list (criterion 6)', () => {
    it('names the item of a mistake with its duration and "1 mistake"', async () => {
      await start()
      await answerWrong()

      await press(EN.finish)

      expect(itemTexts()).toEqual(['do4, whole note / 1 mistake'])
      expect(screen.queryByText(EN.none)).toBeNull()
    })

    it('counts the mistakes on an item: "2 mistakes"', async () => {
      await start()
      await twoOnC4AndOneOnD4()

      await press(EN.finish)

      expect(itemTexts()).toEqual(['do4, whole note / 2 mistakes', 're4, whole note / 1 mistake'])
    })

    it('leaves out the items answered right', async () => {
      await start()
      expectShown('C4')
      await answerWrong()
      await press('Next')
      expectShown('D4')
      await answerRight()

      await press(EN.finish)

      expect(itemTexts()).toEqual(['do4, whole note / 1 mistake'])
    })

    it('counts a question right in the second attempt as a mistake: only the first counts', async () => {
      await start()
      const [wrong] = names.filter((name) => name !== rightName())
      await press(wrong as string)
      await chooseShownDuration()
      await press(EN.check)
      await press(rightName())
      await press(EN.check)

      await press(EN.finish)

      expect(itemTexts()).toEqual(['do4, whole note / 1 mistake'])
    })

    it('stands below the general figures', async () => {
      await start()
      await answerWrong()

      await press(EN.finish)

      const figures = screen.getByText('Best streak')
      const list = mostMistakes()
      expect(list).not.toBeNull()
      expect(
        figures.compareDocumentPosition(list as HTMLElement) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    })

    it('names the notes in the naming of the user: "C4"', async () => {
      await start(EN.noLimit, { naming: 'letter' })
      await answerWrong()

      await press(EN.finish)

      expect(itemTexts()).toEqual(['C4, whole note / 1 mistake'])
    })
  })

  describe('the order (criterion 7)', () => {
    it('puts the later mistake first among items with as many', async () => {
      await start()
      expectShown('C4')
      await answerWrong()
      await press('Next')
      expectShown('D4')
      await answerWrong()

      await press(EN.finish)

      expect(itemTexts()).toEqual(['re4, whole note / 1 mistake', 'do4, whole note / 1 mistake'])
    })
  })

  describe('the links to the wiki (criterion 8)', () => {
    it('links a wrong name to the article on the staff', async () => {
      await start()
      await answerWrong()

      await press(EN.finish)

      const [item] = items()
      expect(linkNames(item as HTMLElement)).toEqual([TOPIC_TITLES.staff])
    })

    it('gives each item its own links', async () => {
      await start()
      await twoOnC4AndOneOnD4()

      await press(EN.finish)

      for (const item of items()) expect(linkNames(item)).toEqual([TOPIC_TITLES.staff])
    })

    it('links a wrong duration to the article on the durations', async () => {
      await start()
      await press(rightName())
      await press('1/2')
      await press(EN.check)

      await press(EN.finish)

      const [item] = items()
      expect(linkNames(item as HTMLElement)).toEqual([TOPIC_TITLES.durations])
    })

    it('links the topics of every Why? of the review: G♭ and a half note for F♯ as a quarter', async () => {
      await start(EN.noLimit, { storage: oneNoteWithSigns(), random: faSharp() })
      for (const name of ['Flat', 'sol', '1/2', EN.check]) await press(name)
      const why = screen.getAllByRole('button', { name: 'Why?' })
      expect(why).toHaveLength(3)

      await press(EN.finish)

      expect(itemTexts()).toEqual(['fa♯4, quarter note / 1 mistake'])
      const [item] = items()
      expect(linkNames(item as HTMLElement)).toEqual([
        TOPIC_TITLES.staff,
        TOPIC_TITLES.accidentals,
        TOPIC_TITLES.durations,
      ])
    })

    it.each(['ru', 'es'] as const)(
      'names the links by the titles of the articles in %s',
      async (locale) => {
        const texts = TEXTS[locale]
        await start(texts.noLimit, { locale })
        await answerWrong(texts.check)

        await press(texts.finish)

        const [item] = items(texts.heading)
        expect(linkNames(item as HTMLElement)).toEqual([texts.staff])
      },
    )
  })

  describe('Write notes (criterion 6, edge case 5)', () => {
    // jsdom lays nothing out, so every element is a box 360 wide and 100 high at the top of the
    // page; the staff lines of the stub run from y = 30 down to y = 70, a step 5: F4 at 65.
    beforeEach(() => {
      const box = { x: 0, y: 0, top: 0, left: 0, width: 360, height: 100, right: 360, bottom: 100 }
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
        ...box,
        toJSON: () => box,
      } as DOMRect)
    })

    it('counts a sharp the key signature gives already, linked to the signs and the key signatures', async () => {
      await start(EN.noLimit, { storage: writingWithSigns(), random: fInGMajor() })
      await touchF4()
      await press('Sharp')
      await press(EN.check)

      await press(EN.finish)

      expect(itemTexts()).toEqual(['fa♯4, whole note / 1 mistake'])
      const [item] = items()
      expect(linkNames(item as HTMLElement)).toEqual([
        TOPIC_TITLES.accidentals,
        TOPIC_TITLES.keySignatures,
      ])
    })

    it('says "No mistakes" after a right note', async () => {
      await start(EN.noLimit, { storage: writingWithSigns(), random: fInGMajor() })
      await touchF4()
      await press(EN.check)

      await press(EN.finish)

      expect(screen.getByText(EN.none)).toBeTruthy()
      expect(mostMistakes()).toBeNull()
    })
  })

  describe('every length (criterion 6)', () => {
    it('counts the mistake on the last question of a session of 10', async () => {
      await start('10')
      for (let number = 1; number < 10; number++) {
        await answerRight()
        await press('Next')
      }
      expectShown('D4')
      await answerWrong()

      await press('Results')

      expect(itemTexts()).toEqual(['re4, whole note / 1 mistake'])
    })

    it('counts the mistakes of a session on time', async () => {
      const clock = await start('3 min')
      expectShown('C4')
      await answerWrong()
      await clock.elapse(3 * MINUTE)

      await press('Results')

      expect(itemTexts()).toEqual(['do4, whole note / 1 mistake'])
    })

    it('counts the mistake when Finish comes during the second attempt', async () => {
      await start()
      const [wrong] = names.filter((name) => name !== rightName())
      await press(wrong as string)
      await chooseShownDuration()
      await press(EN.check)

      await press(EN.finish)

      expect(itemTexts()).toEqual(['do4, whole note / 1 mistake'])
    })
  })

  describe('the texts (criterion 13)', () => {
    it('heads the list and counts in Russian, with the Cyrillic names: «до4, целая», «2 ошибки»', async () => {
      const texts = TEXTS.ru
      await start(texts.noLimit, { locale: 'ru', naming: 'cyrillic-syllable' })
      await twoOnC4AndOneOnD4(texts)

      await press(texts.finish)

      expect(itemTexts(texts.heading)).toEqual(['до4, целая / 2 ошибки', 'ре4, целая / 1 ошибка'])
      expect(mostMistakes(EN.heading)).toBeNull()
    })

    it('heads the list and counts in Spanish: «do4, redonda», «2 errores»', async () => {
      const texts = TEXTS.es
      await start(texts.noLimit, { locale: 'es' })
      await twoOnC4AndOneOnD4(texts)

      await press(texts.finish)

      expect(itemTexts(texts.heading)).toEqual([
        'do4, redonda / 2 errores',
        're4, redonda / 1 error',
      ])
    })
  })
})

// As in presentation/wiki/__tests__/hints.spec.ts: Confident reading with one note in 4/4, with
// sharps and flats, the right answer shown at once.
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

async function touchF4() {
  const column = screen.getAllByRole('slider')[0] as HTMLElement
  await fireEvent.click(column, { clientX: 180, clientY: 65 })
}
