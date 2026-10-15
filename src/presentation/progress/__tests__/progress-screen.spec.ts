import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/vue'
import type { KeyValueStorage } from '@/application/ports'
import type { Locale } from '@/domain/language'
import type { NoteNaming } from '@/domain/naming'
import type { Alteration, Letter } from '@/domain/pitch'
import type { ItemAnswer } from '@/domain/progress'
import type { Duration } from '@/domain/question'
import {
  backToTrainer,
  content,
  goToSection,
  openSettings,
  renderApp,
} from '@/presentation/__tests__/app'
import { forgetDialogs } from '@/presentation/__tests__/dialog'
import {
  createManualWallClock,
  createMemoryStorage,
  failStaffLoading,
  fullStorage,
  mistakeLine,
  preferencesFor,
  progressOver,
  startSession,
  storageWithNoteNaming,
  storageWithOneNoteReading,
  unavailableStorage,
} from '@/presentation/__tests__/screen'

// Feature progress-and-storage, slice 1: the Progress screen with Hardest notes (criteria 1, 5–7
// in part, 18, 20). The screen has the heading Progress and the section Hardest notes: up to ten items wrong in
// a first attempt over all sessions, "F♯4, quarter note — 3 mistakes of 12", in the naming of the
// user; "No mistakes yet" without any. The order itself is the domain's, see domain/progress.
// Sizes, the keyboard and the 360 px width: e2e/progress.spec.ts.
//
// A storage seeded with statistics stands for earlier sessions; a new render over the same
// storage stands for a page reload. Feature navigation-and-settings, slice 1: the naming is chosen
// on the settings screen.
//
// Feature design-system, slice 6: a line of Hardest notes is a line of Most mistakes of the
// results. Its note on a small staff, the clef only, for the eye; then the item in bold and its
// count below it, so the text of a line is "F♯4, quarter note / 3 mistakes of 12", as mistakeLine
// reads it without its staff.

afterEach(() => {
  cleanup()
  forgetDialogs()
})

const TEXTS = {
  en: {
    progress: 'Progress',
    hardest: 'Hardest notes',
    none: 'No mistakes yet',
    trainer: 'Trainer',
    choice: 'Trainer',
  },
  ru: {
    progress: 'Прогресс',
    hardest: 'Самые трудные ноты',
    none: 'Ошибок пока нет',
    trainer: 'Тренажёр',
    choice: 'Тренажёр',
  },
  es: {
    progress: 'Progreso',
    hardest: 'Notas más difíciles',
    none: 'Aún no hay errores',
    trainer: 'Entrenador',
    choice: 'Entrenador',
  },
} as const satisfies Record<Locale, Record<string, string>>

const EN = TEXTS.en

const QUARTER: Duration = { value: 'quarter' }
const DOTTED_QUARTER: Duration = { value: 'quarter', dots: 1 }
const MINUTE = 60_000

const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const findHeading = (name: string) => screen.findByRole('heading', { level: 1, name })

const hardestList = (name: string = EN.hardest) => screen.queryByRole('list', { name })

function items(name: string = EN.hardest): HTMLElement[] {
  const list = hardestList(name)
  if (!list) throw new Error(`no list named ${name}`)
  return within(list).getAllByRole('listitem')
}

const itemTexts = (name?: string) => items(name).map(mistakeLine)

// The staff of a line, as the stub received it; null without one.
const staffOf = (item: HTMLElement) => item.querySelector<HTMLElement>('[data-elements]')

interface Seen {
  readonly letter: Letter
  readonly octave: number
  readonly alteration?: Alteration
  readonly duration?: Duration
  readonly shown: number
  readonly mistakes: number
}

const itemOf = ({ letter, octave, alteration, duration = QUARTER }: Seen) => ({
  pitch: alteration === undefined ? { letter, octave } : { letter, octave, alteration },
  duration,
})

// Earlier sessions as they left the storage: the items in turn, a minute apart, each shown and
// answered wrong as often as given, the mistakes first.
function storageWithStatistics(seen: readonly Seen[], storage = createMemoryStorage()) {
  const wallClock = createManualWallClock()
  const progress = progressOver(storage, wallClock.clock)
  for (const each of seen) {
    const item = itemOf(each)
    for (let shown = 0; shown < each.shown; shown++) {
      const answer: ItemAnswer = { item, right: shown >= each.mistakes }
      progress.recordAnswers([answer])
    }
    wallClock.elapse(MINUTE)
  }
  return storage
}

const F_SHARP_4: Seen = { letter: 'F', octave: 4, alteration: 1, shown: 12, mistakes: 3 }

// Feature navigation-and-settings, slice 2: the screen is reached by its tab of the navigation,
// and left by the tab Trainer.
async function openProgress(texts: (typeof TEXTS)[Locale] = EN, locale: Locale = 'en') {
  await goToSection(texts.progress, locale)
  await findHeading(texts.progress)
}

async function visitProgress(storage: KeyValueStorage, locale: Locale = 'en') {
  await renderApp({ storage, locale })
  await openProgress(TEXTS[locale], locale)
}

describe('the tab Progress (criterion 1)', () => {
  it('opens the screen Progress', async () => {
    const { router } = await renderApp()

    await openProgress()

    expect(router.currentRoute.value.path).toBe('/progress')
    expect(screen.queryByRole('heading', { level: 1, name: EN.choice })).toBeNull()
  })

  it('is left by the tab Trainer for the choice screen', async () => {
    const { router } = await renderApp()
    await openProgress()

    await goToSection(EN.trainer)

    expect(await findHeading(EN.choice)).toBeTruthy()
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('opens the screen at its own address, with no link Trainer of its own', async () => {
    await renderApp({ path: '/progress' })

    expect(await findHeading(EN.progress)).toBeTruthy()
    expect(content().queryByRole('link', { name: EN.trainer })).toBeNull()
  })

  it.each(['ru', 'es'] as const)('is in the language of the interface: %s', async (locale) => {
    const texts = TEXTS[locale]
    await renderApp({ locale })

    await openProgress(texts, locale)

    expect(screen.getByRole('heading', { level: 2, name: texts.hardest })).toBeTruthy()
  })
})

describe('Hardest notes (criteria 5, 7)', () => {
  it('says "No mistakes yet" without mistakes, below its heading', async () => {
    await visitProgress(createMemoryStorage())

    const heading = screen.getByRole('heading', { level: 2, name: EN.hardest })
    const none = screen.getByText(EN.none)
    expect(heading.compareDocumentPosition(none) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(hardestList()).toBeNull()
  })

  it('says "No mistakes yet" after answers all right', async () => {
    await visitProgress(
      storageWithStatistics([
        { letter: 'C', octave: 4, shown: 5, mistakes: 0 },
        { letter: 'D', octave: 4, shown: 2, mistakes: 0 },
      ]),
    )

    expect(screen.getByText(EN.none)).toBeTruthy()
    expect(hardestList()).toBeNull()
  })

  it('names an item with its duration, its mistakes and its showings', async () => {
    await visitProgress(storageWithStatistics([F_SHARP_4], storageWithNoteNaming('letter')))

    expect(itemTexts()).toEqual(['F♯4, quarter note / 3 mistakes of 12'])
    expect(screen.queryByText(EN.none)).toBeNull()
  })

  it('says one mistake of one showing', async () => {
    await visitProgress(
      storageWithStatistics(
        [{ letter: 'C', octave: 4, shown: 1, mistakes: 1 }],
        storageWithNoteNaming('letter'),
      ),
    )

    expect(itemTexts()).toEqual(['C4, quarter note / 1 mistake of 1'])
  })

  it('names a dotted duration and a flat', async () => {
    await visitProgress(
      storageWithStatistics(
        [
          {
            letter: 'B',
            octave: 4,
            alteration: -1,
            duration: DOTTED_QUARTER,
            shown: 4,
            mistakes: 2,
          },
        ],
        storageWithNoteNaming('letter'),
      ),
    )

    expect(itemTexts()).toEqual(['B♭4, dotted quarter note / 2 mistakes of 4'])
  })

  it('names the items in the naming of the user', async () => {
    await visitProgress(storageWithStatistics([F_SHARP_4]))

    expect(itemTexts()).toEqual(['fa♯4, quarter note / 3 mistakes of 12'])
  })

  it('follows a naming chosen on the settings screen', async () => {
    await renderApp({ storage: storageWithStatistics([F_SHARP_4]) })
    await openSettings()
    const select = screen.getByRole<HTMLSelectElement>('combobox', { name: 'Note names' })
    const letters = within(select).getByRole<HTMLOptionElement>('option', { name: 'C, D, E' })
    await fireEvent.update(select, letters.value)
    await backToTrainer()

    await openProgress()

    expect(itemTexts()).toEqual(['F♯4, quarter note / 3 mistakes of 12'])
  })

  it('puts the item with more mistakes first, then the one shown later', async () => {
    await visitProgress(
      storageWithStatistics(
        [
          { letter: 'C', octave: 4, shown: 3, mistakes: 1 },
          { letter: 'D', octave: 4, shown: 5, mistakes: 3 },
          { letter: 'E', octave: 4, shown: 1, mistakes: 1 },
        ],
        storageWithNoteNaming('letter'),
      ),
    )

    expect(itemTexts()).toEqual([
      'D4, quarter note / 3 mistakes of 5',
      'E4, quarter note / 1 mistake of 1',
      'C4, quarter note / 1 mistake of 3',
    ])
  })

  it('lists up to ten items', async () => {
    const seen: Seen[] = (['C', 'D', 'E', 'F', 'G', 'A'] as const).flatMap((letter) => [
      { letter, octave: 4, shown: 1, mistakes: 1 },
      { letter, octave: 5, shown: 1, mistakes: 1 },
    ])

    await visitProgress(storageWithStatistics(seen, storageWithNoteNaming('letter')))

    expect(itemTexts().map((text) => text.split(',')[0])).toEqual([
      'A5',
      'A4',
      'G5',
      'G4',
      'F5',
      'F4',
      'E5',
      'E4',
      'D5',
      'D4',
    ])
  })

  it.each<[Locale, NoteNaming, string]>([
    ['ru', 'cyrillic-syllable', 'фа♯4, четверть / 3 ошибки из 12'],
    ['es', 'latin-syllable', 'fa♯4, negra / 3 errores de 12'],
  ])('names the items in %s', async (locale, naming, text) => {
    await visitProgress(storageWithStatistics([F_SHARP_4], storageWithNoteNaming(naming)), locale)

    expect(itemTexts(TEXTS[locale].hardest)).toEqual([text])
  })

  it.each<[Locale, string]>([
    ['ru', '1 ошибка из 1'],
    ['es', '1 error de 1'],
  ])('says one mistake in %s', async (locale, count) => {
    await visitProgress(
      storageWithStatistics([{ letter: 'C', octave: 4, shown: 1, mistakes: 1 }]),
      locale,
    )

    expect(itemTexts(TEXTS[locale].hardest)[0]?.endsWith(count)).toBe(true)
  })

  it.each(['ru', 'es'] as const)('says there are no mistakes yet in %s', async (locale) => {
    await visitProgress(createMemoryStorage(), locale)

    expect(screen.getByText(TEXTS[locale].none)).toBeTruthy()
    expect(screen.queryByText(EN.none)).toBeNull()
  })
})

// Feature design-system, slice 6, criterion 11.
describe('a line of Hardest notes', () => {
  const follows = (earlier: Element, later: Element) =>
    (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

  async function visitWithTwoItems() {
    await visitProgress(
      storageWithStatistics(
        [F_SHARP_4, { letter: 'B', octave: 4, alteration: -1, shown: 2, mistakes: 1 }],
        storageWithNoteNaming('letter'),
      ),
    )
  }

  it('gives the item in bold apart from its count: "F♯4, quarter note", "3 mistakes of 12"', async () => {
    await visitWithTwoItems()

    const [item] = items() as [HTMLElement]
    expect(mistakeLine(item)).toBe('F♯4, quarter note / 3 mistakes of 12')
    expect(within(item).getByText('F♯4, quarter note')).toBeTruthy()
    expect(within(item).getByText('3 mistakes of 12')).toBeTruthy()
  })

  it('shows the note of each line on its own staff, the clef only, its sign before it', async () => {
    await visitWithTwoItems()

    expect(
      items().map((item) => {
        const staff = staffOf(item)
        if (!staff) throw new Error('no staff in the line')
        return {
          elements: staff.getAttribute('data-elements'),
          signs: staff.getAttribute('data-signs'),
          keySignature: staff.getAttribute('data-key-signature'),
          timeSignature: staff.getAttribute('data-time-signature'),
        }
      }),
    ).toEqual([
      { elements: 'F#4/quarter', signs: 'sharp', keySignature: 'none', timeSignature: 'none' },
      { elements: 'Bb4/quarter', signs: 'flat', keySignature: 'none', timeSignature: 'none' },
    ])
  })

  it('puts the staff before the text of the line', async () => {
    await visitWithTwoItems()

    const [item] = items() as [HTMLElement]
    expect(follows(staffOf(item) as HTMLElement, within(item).getByText('F♯4, quarter note'))).toBe(
      true,
    )
  })

  it('gives the staff for the eye only: the text of the line names the note', async () => {
    await visitWithTwoItems()

    for (const item of items()) {
      expect(staffOf(item)).not.toBeNull()
      expect(within(item).queryAllByRole('img')).toEqual([])
    }
  })

  it('leaves the line without its staff when the staff fails to load', async () => {
    await visitWithTwoItems()

    failStaffLoading()
    await waitFor(() => expect(staffOf(items()[0] as HTMLElement)).toBeNull())

    expect(itemTexts()).toEqual([
      'F♯4, quarter note / 3 mistakes of 12',
      'B♭4, quarter note / 1 mistake of 2',
    ])
  })

  it.each<[Locale, NoteNaming, string, string]>([
    ['ru', 'cyrillic-syllable', 'фа♯4, четверть', '3 ошибки из 12'],
    ['es', 'latin-syllable', 'fa♯4, negra', '3 errores de 12'],
  ])('says the line in %s', async (locale, naming, item, count) => {
    await visitProgress(storageWithStatistics([F_SHARP_4], storageWithNoteNaming(naming)), locale)

    const [line] = items(TEXTS[locale].hardest) as [HTMLElement]
    expect(within(line).getByText(item)).toBeTruthy()
    expect(within(line).getByText(count)).toBeTruthy()
  })
})

// The page runs in Confident reading with one note in 4/4, the random source a constant 0, so the
// questions are C4 (do), D4 (re), a whole note each.
describe('the answers of a session in Hardest notes (criterion 6)', () => {
  async function answerWrongTwice(first: string, second: string) {
    await press(first)
    await press('1/1')
    await press('Check')
    await press(second)
    await press('Check')
  }

  async function answerRight(name: string) {
    await press(name)
    await press('1/1')
    await press('Check')
  }

  // C4 wrong in both attempts, D4 right, then back on the choice screen.
  async function playSession() {
    await startSession('No limit')
    await answerWrongTwice('mi', 'fa')
    await press('Next')
    await answerRight('re')
    await press('Finish')
    await findHeading('Results')
    await press('New session')
    await findHeading(EN.choice)
  }

  it('lists an item answered wrong in a session', async () => {
    await renderApp({ storage: storageWithOneNoteReading() })
    await playSession()

    await openProgress()

    expect(itemTexts()).toEqual(['do4, whole note / 1 mistake of 1'])
  })

  it('counts the showings of a session with those before it', async () => {
    const storage = storageWithStatistics(
      [{ letter: 'C', octave: 4, duration: { value: 'whole' }, shown: 3, mistakes: 1 }],
      storageWithOneNoteReading(),
    )
    await renderApp({ storage })
    await playSession()

    await openProgress()

    expect(itemTexts()).toEqual(['do4, whole note / 2 mistakes of 4'])
  })

  it('keeps the items after a reload', async () => {
    const storage = storageWithOneNoteReading()
    const first = await renderApp({ storage })
    await playSession()
    first.unmount()

    await visitProgress(storage)

    expect(itemTexts()).toEqual(['do4, whole note / 1 mistake of 1'])
  })

  // Decision of the lead on slice 1: as the preferences, the statistics are kept until the page
  // is closed (criteria 18, 19).
  it.each([
    ['unavailable', unavailableStorage],
    ['full', fullStorage],
  ])('lists the items of this page with a storage %s', async (_, storage) => {
    await renderApp({ preferences: preferencesFor(['en']), progress: progressOver(storage()) })
    await playSession()

    await openProgress()

    expect(itemTexts()).toEqual(['do4, whole note / 1 mistake of 1'])
  })

  it('lists nothing after a reload with an unavailable storage', async () => {
    const storage = unavailableStorage()
    const first = await renderApp({
      preferences: preferencesFor(['en']),
      progress: progressOver(storage),
    })
    await playSession()
    first.unmount()

    await renderApp({ preferences: preferencesFor(['en']), progress: progressOver(storage) })
    await openProgress()

    expect(screen.getByText(EN.none)).toBeTruthy()
  })
})
