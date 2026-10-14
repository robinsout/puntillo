import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, within } from '@testing-library/vue'
import type { KeyValueStorage } from '@/application/ports'
import type { Locale } from '@/domain/language'
import type { Letter } from '@/domain/pitch'
import type { SessionSummary } from '@/domain/progress'
import { goToSection, renderApp } from '@/presentation/__tests__/app'
import { forgetDialogs } from '@/presentation/__tests__/dialog'
import {
  createManualWallClock,
  createMemoryStorage,
  fullStorage,
  preferencesFor,
  progressOver,
  storageWithOneNoteReading,
  unavailableStorage,
} from '@/presentation/__tests__/screen'

// Feature progress-and-storage, slice 2: Recent sessions on the Progress screen (criteria 2–4, 7,
// 20). Above Hardest notes, under the heading Recent sessions, the sessions that reached their
// results in the last 30 days, the latest first, one line each: the date in the language of the
// interface, the exercise and the length as the choice screen names them, the questions checked
// and the accuracy. A length of a number of questions is not said apart from the questions:
// "13 Oct · Read notes · 20 questions · 85%"; a session on time or without a limit says its length
// before the questions: "13 Oct · Write notes · 5 min · 12 questions · 67%". "No sessions yet"
// without any. The 30 days themselves are the domain's, see domain/progress. Sizes and the 360 px
// width: e2e/progress.spec.ts.
//
// A storage seeded with sessions stands for earlier visits; a new render over the same storage
// stands for a page reload. Unless given, the wall clock of the page reads 13 Oct 2026, noon UTC.

afterEach(() => {
  cleanup()
  forgetDialogs()
})

const TEXTS = {
  en: { progress: 'Progress', recent: 'Recent sessions', none: 'No sessions yet' },
  ru: { progress: 'Прогресс', recent: 'Последние сессии', none: 'Сессий пока нет' },
  es: { progress: 'Progreso', recent: 'Sesiones recientes', none: 'Aún no hay sesiones' },
} as const satisfies Record<Locale, Record<string, string>>

const EN = TEXTS.en

// As in the results: Russian and Spanish keep % on the line of its number.
const NBSP = '\u00A0'

const DAY = 24 * 60 * 60 * 1000
const OCT_13_2026 = Date.UTC(2026, 9, 13, 12)

const READ_20: SessionSummary = { exercise: 'read', length: 20, questions: 20, accuracy: 85 }
const WRITE_5_MIN: SessionSummary = {
  exercise: 'write',
  length: { minutes: 5 },
  questions: 12,
  accuracy: 67,
}
const READ_NO_LIMIT: SessionSummary = {
  exercise: 'read',
  length: 'unlimited',
  questions: 1,
  accuracy: 100,
}

const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const findHeading = (name: string) => screen.findByRole('heading', { level: 1, name })

const recentList = (name: string = EN.recent) => screen.queryByRole('list', { name })

function sessionLines(name: string = EN.recent): string[] {
  const list = recentList(name)
  if (!list) throw new Error(`no list named ${name}`)
  return within(list)
    .getAllByRole('listitem')
    .map((item) => item.textContent?.replace(/[ \t\r\n]+/g, ' ').trim() ?? '')
}

interface Finished {
  readonly summary: SessionSummary
  // Before 13 Oct 2026, noon UTC.
  readonly daysAgo?: number
}

// Earlier sessions as they left the storage, recorded in the order given.
function storageWithSessions(sessions: readonly Finished[], storage = createMemoryStorage()) {
  for (const { summary, daysAgo = 0 } of sessions) {
    progressOver(storage, createManualWallClock(OCT_13_2026 - daysAgo * DAY).clock).recordSession(
      summary,
    )
  }
  return storage
}

async function openProgress(texts: (typeof TEXTS)[Locale] = EN, locale: Locale = 'en') {
  await goToSection(texts.progress, locale)
  await findHeading(texts.progress)
}

async function visitProgress(storage: KeyValueStorage, locale: Locale = 'en') {
  await renderApp({ storage, locale })
  await openProgress(TEXTS[locale], locale)
}

describe('Recent sessions (criteria 2, 7)', () => {
  it('says "No sessions yet" without sessions, below its heading', async () => {
    await visitProgress(createMemoryStorage())

    const heading = screen.getByRole('heading', { level: 2, name: EN.recent })
    const none = screen.getByText(EN.none)
    expect(heading.compareDocumentPosition(none) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(recentList()).toBeNull()
  })

  it('stands above Hardest notes', async () => {
    await visitProgress(createMemoryStorage())

    const recent = screen.getByRole('heading', { level: 2, name: EN.recent })
    const hardest = screen.getByRole('heading', { level: 2, name: 'Hardest notes' })
    expect(recent.compareDocumentPosition(hardest) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('says a session of a number of questions by its questions', async () => {
    await visitProgress(storageWithSessions([{ summary: READ_20 }]))

    expect(sessionLines()).toEqual(['13 Oct · Read notes · 20 questions · 85%'])
    expect(screen.queryByText(EN.none)).toBeNull()
  })

  it('says the questions checked, not the length, of a session of a number of questions', async () => {
    await visitProgress(
      storageWithSessions([
        { summary: { exercise: 'read', length: 50, questions: 7, accuracy: 93 } },
      ]),
    )

    expect(sessionLines()).toEqual(['13 Oct · Read notes · 7 questions · 93%'])
  })

  it('says the length of a session on time before its questions', async () => {
    await visitProgress(storageWithSessions([{ summary: WRITE_5_MIN }]))

    expect(sessionLines()).toEqual(['13 Oct · Write notes · 5 min · 12 questions · 67%'])
  })

  it('says No limit before the questions of a session without a limit, one question', async () => {
    await visitProgress(storageWithSessions([{ summary: READ_NO_LIMIT }]))

    expect(sessionLines()).toEqual(['13 Oct · Read notes · No limit · 1 question · 100%'])
  })

  it('says the date each session finished, the latest first', async () => {
    await visitProgress(
      storageWithSessions([
        { summary: READ_20, daysAgo: 12 },
        { summary: WRITE_5_MIN, daysAgo: 1 },
        { summary: READ_NO_LIMIT },
      ]),
    )

    expect(sessionLines()).toEqual([
      '13 Oct · Read notes · No limit · 1 question · 100%',
      '12 Oct · Write notes · 5 min · 12 questions · 67%',
      '1 Oct · Read notes · 20 questions · 85%',
    ])
  })

  it('leaves out a session older than 30 days (criterion 4)', async () => {
    await visitProgress(
      storageWithSessions([
        { summary: WRITE_5_MIN, daysAgo: 31 },
        { summary: READ_20, daysAgo: 12 },
      ]),
    )

    expect(sessionLines()).toEqual(['1 Oct · Read notes · 20 questions · 85%'])
  })

  it('says "No sessions yet" when every session is older than 30 days', async () => {
    await visitProgress(storageWithSessions([{ summary: READ_20, daysAgo: 31 }]))

    expect(screen.getByText(EN.none)).toBeTruthy()
    expect(recentList()).toBeNull()
  })

  it.each<[Locale, string[]]>([
    [
      'ru',
      [
        `13 окт. · Записывать ноты · 5 мин · 12 вопросов · 67${NBSP}%`,
        `13 окт. · Читать ноты · Без ограничения · 1 вопрос · 100${NBSP}%`,
        `13 окт. · Читать ноты · 20 вопросов · 85${NBSP}%`,
      ],
    ],
    [
      'es',
      [
        `13 oct · Escribir notas · 5 min · 12 preguntas · 67${NBSP}%`,
        `13 oct · Leer notas · Sin límite · 1 pregunta · 100${NBSP}%`,
        `13 oct · Leer notas · 20 preguntas · 85${NBSP}%`,
      ],
    ],
  ])('says the sessions in %s', async (locale, lines) => {
    await visitProgress(
      storageWithSessions([
        { summary: READ_20 },
        { summary: READ_NO_LIMIT },
        { summary: WRITE_5_MIN },
      ]),
      locale,
    )

    expect(sessionLines(TEXTS[locale].recent)).toEqual(lines)
  })

  it.each(['ru', 'es'] as const)('says there are no sessions yet in %s', async (locale) => {
    await visitProgress(createMemoryStorage(), locale)

    expect(screen.getByRole('heading', { level: 2, name: TEXTS[locale].recent })).toBeTruthy()
    expect(screen.getByText(TEXTS[locale].none)).toBeTruthy()
    expect(screen.queryByText(EN.none)).toBeNull()
  })
})

// The page runs in Confident reading with one note in 4/4, the random source a constant 0, so the
// questions are C4 (do), D4 (re), a whole note each.
describe('the sessions of the page in Recent sessions (criterion 3)', () => {
  const SYLLABLES: Record<Letter, string> = {
    C: 'do',
    D: 're',
    E: 'mi',
    F: 'fa',
    G: 'sol',
    A: 'la',
    B: 'si',
  }

  // The note on the staff, as the stub received it: "C4".
  function shownSyllable(): string {
    const letter = document.querySelector('[data-pitch]')?.getAttribute('data-pitch')?.[0]
    const syllable = SYLLABLES[letter as Letter]
    if (!syllable) throw new Error('no note is drawn on the staff')
    return syllable
  }

  async function answerRight() {
    await press(shownSyllable())
    await press('1/1')
    await press('Check')
  }

  // Both attempts wrong on the name, the duration right: one point of two.
  async function answerWrong() {
    const right = shownSyllable()
    await press(right === 'mi' ? 'fa' : 'mi')
    await press('1/1')
    await press('Check')
    await press(right === 'si' ? 'la' : 'si')
    await press('Check')
  }

  async function toChoice() {
    await press('New session')
    await findHeading('Session length')
  }

  // C4 wrong in both attempts, D4 right, then Finish: 3 points of 4.
  async function playNoLimit() {
    await press('No limit')
    await answerWrong()
    await press('Next')
    await answerRight()
    await press('Finish')
    await findHeading('Results')
  }

  const NO_LIMIT_LINE = '13 Oct · Read notes · No limit · 2 questions · 75%'

  it('lists a session ended by Finish', async () => {
    await renderApp({ storage: storageWithOneNoteReading() })
    await playNoLimit()
    await toChoice()

    await openProgress()

    expect(sessionLines()).toEqual([NO_LIMIT_LINE])
  })

  it('lists a session ended by its number of questions', async () => {
    await renderApp({ storage: storageWithOneNoteReading() })
    await press('10')
    for (let number = 1; number < 10; number++) {
      await answerRight()
      await press('Next')
    }
    await answerRight()
    await press('Results')
    await findHeading('Results')
    await toChoice()

    await openProgress()

    expect(sessionLines()).toEqual(['13 Oct · Read notes · 10 questions · 100%'])
  })

  it('lists nothing for a session left by Finish without a check', async () => {
    await renderApp({ storage: storageWithOneNoteReading() })
    await press('No limit')
    await press('Finish')
    await findHeading('Session length')

    await openProgress()

    expect(screen.getByText(EN.none)).toBeTruthy()
    expect(recentList()).toBeNull()
  })

  it('lists Practice only these as a session of its own, the latest first', async () => {
    await renderApp({ storage: storageWithOneNoteReading() })
    await playNoLimit()
    await press('Practice only these')
    await answerRight()
    await press('Finish')
    await findHeading('Results')
    await toChoice()

    await openProgress()

    expect(sessionLines()).toEqual([
      '13 Oct · Read notes · No limit · 1 question · 100%',
      NO_LIMIT_LINE,
    ])
  })

  it('dates a session by the wall clock as its results open', async () => {
    const storage = storageWithOneNoteReading()
    await renderApp({
      storage,
      progress: progressOver(storage, createManualWallClock(Date.UTC(2026, 0, 5, 12)).clock),
    })
    await playNoLimit()
    await toChoice()

    await openProgress()

    expect(sessionLines()).toEqual(['5 Jan · Read notes · No limit · 2 questions · 75%'])
  })

  it('adds the session to those before it', async () => {
    const storage = storageWithSessions(
      [{ summary: WRITE_5_MIN, daysAgo: 2 }],
      storageWithOneNoteReading(),
    )
    await renderApp({ storage })
    await playNoLimit()
    await toChoice()

    await openProgress()

    expect(sessionLines()).toEqual([
      NO_LIMIT_LINE,
      '11 Oct · Write notes · 5 min · 12 questions · 67%',
    ])
  })

  it('keeps the sessions after a reload', async () => {
    const storage = storageWithOneNoteReading()
    const first = await renderApp({ storage })
    await playNoLimit()
    first.unmount()

    await visitProgress(storage)

    expect(sessionLines()).toEqual([NO_LIMIT_LINE])
  })

  // Decision of the lead on slice 2: as the statistics, the history is kept until the page is
  // closed (criteria 18, 19).
  it.each([
    ['unavailable', unavailableStorage],
    ['full', fullStorage],
  ])('lists the sessions of this page with a storage %s', async (_, storage) => {
    await renderApp({ preferences: preferencesFor(['en']), progress: progressOver(storage()) })
    await playNoLimit()
    await toChoice()

    await openProgress()

    expect(sessionLines()).toEqual([NO_LIMIT_LINE])
  })

  it('lists nothing after a reload with an unavailable storage', async () => {
    const storage = unavailableStorage()
    const first = await renderApp({
      preferences: preferencesFor(['en']),
      progress: progressOver(storage),
    })
    await playNoLimit()
    first.unmount()

    await renderApp({ preferences: preferencesFor(['en']), progress: progressOver(storage) })
    await openProgress()

    expect(screen.getByText(EN.none)).toBeTruthy()
  })
})
