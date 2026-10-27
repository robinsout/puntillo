import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'
import {
  cleanup,
  fireEvent,
  getDefaultNormalizer,
  screen,
  waitFor,
  within,
} from '@testing-library/vue'
import type { KeyValueStorage } from '@/application/ports'
import { presetDifficulty, type Difficulty } from '@/domain/difficulty'
import type { Locale } from '@/domain/language'
import type { SavedSession } from '@/domain/progress'
import { createQuestion, type Grade } from '@/domain/question'
import { EMPTY_REVIEW_QUEUE } from '@/domain/review-queue'
import { NO_MISTAKES, type SessionLength } from '@/domain/session'
import { forgetDialogs } from '@/presentation/__tests__/dialog'
import {
  startSession,
  chooseShownDuration,
  createManualClock,
  preferencesFor,
  progressOver,
  renderSessionWith,
  startingOnC4,
  storageWithOneNoteReading,
  unpressedNoteNameButtons,
  type ManualClock,
  queryProgressBar,
} from '@/presentation/__tests__/screen'
import type { IconName } from '@/presentation/ui'
import UiIcon from '@/presentation/ui/UiIcon.vue'

// Feature progress-and-storage, slice 3: the session not finished on the choice screen (criteria
// 8–13, 20, edge case 2; the sizes and the 360 px width are the end-to-end tests').
//
// - A session is saved from its first check on; when the page opens with one saved, the choice
//   screen starts with a block under the heading "Unfinished session" (level 2): the exercise, the
//   position and the accuracy, "Read notes · question 7 of 20 · 86%", a session on time "Read notes
//   · Time: 1:24 · 86%", one without a limit "Read notes · question 7 · 86%"; then Continue and
//   Discard.
//   The position is the number of the question on the screen when the session was left.
// - Continue goes on with the session: the question not checked opens again without the choices
//   made, a question checked gives way to the next one, the last one checked to the results. The
//   focus moves to the heading of the question, as on any start of a session.
// - Discard takes the block away and the focus to the heading of the choice screen; the session is
//   gone after a reload too. Starting a session discards it as well, and so do the results.
// - The page saves the session as it is hidden, so that the time of a session on time is right.
// - Texts in three languages; "question 7" without a length, decided in slice 3: "вопрос 7",
//   "pregunta 7".
//
// The page runs in Confident reading with one note in 4/4; questions start on C4 (do), a whole
// note, then D4 (re). A new render over the same storage stands for a reload.

afterEach(() => {
  cleanup()
  forgetDialogs()
  vi.restoreAllMocks()
})

const TEXTS = {
  en: {
    heading: 'Unfinished session',
    continue: 'Continue',
    discard: 'Discard',
    line: 'Read notes · question 7 of 20 · 86%',
    timed: 'Read notes · Time: 1:24 · 86%',
    noLimit: 'Read notes · question 7 · 86%',
  },
  ru: {
    heading: 'Незавершённая сессия',
    continue: 'Продолжить',
    discard: 'Остановить',
    line: 'Читать ноты · вопрос 7 из 20 · 86 %',
    timed: 'Читать ноты · Время: 1:24 · 86 %',
    noLimit: 'Читать ноты · вопрос 7 · 86\u00A0%',
  },
  es: {
    heading: 'Sesión sin terminar',
    continue: 'Continuar',
    discard: 'Descartar',
    line: 'Leer notas · pregunta 7 de 20 · 86 %',
    timed: 'Leer notas · Tiempo: 1:24 · 86 %',
    noLimit: 'Leer notas · pregunta 7 · 86\u00A0%',
  },
} as const satisfies Record<Locale, Record<string, string>>

const EN = TEXTS.en

const button = (name: string) => screen.getByRole('button', { name })
const queryButton = (name: string) => screen.queryByRole('button', { name })
const press = (name: string) => fireEvent.click(button(name))
// Whitespace kept as it is, so that the no-break space before % in Russian and Spanish counts.
const queryText = (text: string) =>
  screen.queryByText(text, { normalizer: getDefaultNormalizer({ collapseWhitespace: false }) })
const h1 = (name: string) => screen.queryByRole('heading', { level: 1, name })
const blockHeading = (name: string = EN.heading) =>
  screen.queryByRole('heading', { level: 2, name })
const shownPitch = () => document.querySelector('[data-pitch]')?.getAttribute('data-pitch')
// The block is a region named by its heading, its buttons looked for within it.
const block = (name: string = EN.heading) => screen.queryByRole('region', { name })
function blockButton(name: string, region: string = EN.heading) {
  const found = block(region)
  return found ? within(found).queryByRole('button', { name }) : null
}
async function pressInBlock(name: string) {
  const found = blockButton(name)
  if (!found) throw new Error(`no button ${name} in the block`)
  await fireEvent.click(found)
}

interface Visit {
  readonly locale?: Locale
  readonly clock?: ManualClock
}

// A page load over the storage of the browser: the preferences and the progress are read from it.
function openPage(
  storage: KeyValueStorage,
  { locale = 'en', clock = createManualClock() }: Visit = {},
) {
  renderSessionWith({
    random: startingOnC4(),
    clock: clock.clock,
    timer: clock.timer,
    preferences: preferencesFor([locale], storage),
    progress: progressOver(storage),
  })
  return clock
}

function reload(storage: KeyValueStorage, visit: Visit = {}) {
  cleanup()
  forgetDialogs()
  return openPage(storage, visit)
}

async function answer(name: string) {
  await press(name)
  await chooseShownDuration()
  await press('Check')
}

// do on C4, both points.
const answerRight = () => answer('do')

// mi on D4, then fa: the duration right, one point of two.
async function answerWrongTwice() {
  await answer('mi')
  await press('fa')
  await press('Check')
}

const ONE_NOTE_READING: Difficulty = preferencesFor(['en']).difficulty

const RIGHT: Grade = [{ pitch: true, duration: true }]

// A session of 20 left on its seventh question, 12 points of 14 so far: 86%.
const SAVED: SavedSession = {
  exercise: 'read',
  length: 20,
  difficulty: ONE_NOTE_READING,
  attempts: 2,
  number: 7,
  elapsedMs: 84_000,
  score: { checked: 7, points: 12, maxPoints: 14, streak: 2, bestStreak: 4, totalTimeMs: 21_000 },
  mistakes: NO_MISTAKES,
  reviewQueue: EMPTY_REVIEW_QUEUE,
  question: createQuestion({ pitch: { letter: 'E', octave: 4 }, duration: { value: 'half' } }),
  grades: null,
}

// A storage as an earlier visit left it, with a session not finished.
function storageWithSession(changes: Partial<SavedSession> = {}) {
  const storage = storageWithOneNoteReading()
  progressOver(storage).saveSession({ ...SAVED, ...changes })
  return storage
}

const withLength = (length: SessionLength) => storageWithSession({ length })

describe('Unfinished session (criteria 8, 9)', () => {
  it('is not shown without a session left', () => {
    openPage(storageWithOneNoteReading())

    expect(blockHeading()).toBeNull()
    expect(block()).toBeNull()
    expect(queryButton(EN.continue)).toBeNull()
    expect(queryButton(EN.discard)).toBeNull()
  })

  it('is not shown for a session left before its first check', async () => {
    const storage = storageWithOneNoteReading()
    openPage(storage)
    await startSession('20')
    await press('do')

    reload(storage)

    expect(blockHeading()).toBeNull()
  })

  it('is shown after a reload of a session left after a check', async () => {
    const storage = storageWithOneNoteReading()
    openPage(storage)
    await startSession('20')
    await answerRight()
    await press('Next')
    await answerWrongTwice()
    await press('Next')

    reload(storage)

    expect(blockHeading()).not.toBeNull()
    // 3 points of 4.
    expect(queryText('Read notes · question 3 of 20 · 75%')).not.toBeNull()
    expect(blockButton(EN.continue)).not.toBeNull()
    expect(blockButton(EN.discard)).not.toBeNull()
  })

  it('is shown for a session left on a question checked, with its number', async () => {
    const storage = storageWithOneNoteReading()
    openPage(storage)
    await startSession('No limit')

    await answerRight()

    reload(storage)
    expect(queryText('Read notes · question 1 · 100%')).not.toBeNull()
  })

  it('stands at the top of the choice screen', () => {
    openPage(storageWithSession())

    const heading = blockHeading()
    const exercise = screen.getByRole('group', { name: 'Exercise' })
    expect(heading?.compareDocumentPosition(exercise)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    // The hidden Trainer heading takes the focus; the block is read right after it.
    expect(screen.getAllByRole('heading', { level: 1 })[0]?.textContent?.trim()).toBe('Trainer')
    expect(screen.getAllByRole('heading', { level: 2 })[0]).toBe(heading)
    expect(screen.getAllByRole('region')[0]).toBe(block())
  })

  it('says the exercise, the question of the length and the accuracy', () => {
    openPage(storageWithSession())

    expect(queryText(EN.line)).not.toBeNull()
    expect(block()?.contains(queryText(EN.line))).toBe(true)
  })

  it('says the time passed of a session on time', () => {
    openPage(withLength({ minutes: 5 }))

    expect(queryText(EN.timed)).not.toBeNull()
  })

  it('says the question alone of a session without a limit', () => {
    openPage(withLength('unlimited'))

    expect(queryText(EN.noLimit)).not.toBeNull()
  })

  it('says Write notes of a session of Write notes', () => {
    openPage(storageWithSession({ exercise: 'write', difficulty: presetDifficulty('first-steps') }))

    expect(queryText('Write notes · question 7 of 20 · 86%')).not.toBeNull()
  })

  it.each(['ru', 'es'] as const)('speaks %s', (locale) => {
    const texts = TEXTS[locale]
    openPage(storageWithSession(), { locale })

    expect(blockHeading(texts.heading)).not.toBeNull()
    expect(queryText(texts.line)).not.toBeNull()
    expect(blockButton(texts.continue, texts.heading)).not.toBeNull()
    expect(blockButton(texts.discard, texts.heading)).not.toBeNull()
  })

  it.each(['ru', 'es'] as const)('speaks %s of a session on time', (locale) => {
    openPage(withLength({ minutes: 5 }), { locale })

    expect(queryText(TEXTS[locale].timed)).not.toBeNull()
  })

  it.each(['ru', 'es'] as const)('speaks %s of a session without a limit', (locale) => {
    openPage(withLength('unlimited'), { locale })

    expect(queryText(TEXTS[locale].noLimit)).not.toBeNull()
  })
})

describe('Continue (criteria 10, 11)', () => {
  // Feature navigation-and-settings, slice 4: Start is the one primary button of the screen.
  it('is a secondary button, Start being the only primary one', () => {
    openPage(storageWithSession())

    expect(blockButton(EN.continue)?.classList.contains('primary')).toBe(false)
    const primary = [...document.querySelectorAll('button.primary')]
    expect(primary).toEqual([screen.getByRole('button', { name: 'Start' })])
  })

  it('opens the question not checked again, without choices', async () => {
    openPage(storageWithSession())

    await pressInBlock(EN.continue)

    expect(h1('Name the note')).not.toBeNull()
    expect(queryProgressBar('Question 7 of 20')).not.toBeNull()
    expect(queryText('Accuracy 86%')).not.toBeNull()
    expect(shownPitch()).toBe('E4')
    expect(unpressedNoteNameButtons()).toHaveLength(7)
  })

  it('moves the focus to the heading of the question', async () => {
    openPage(storageWithSession())

    await pressInBlock(EN.continue)

    await waitFor(() => expect(document.activeElement).toBe(h1('Name the note')))
  })

  it('opens the next question after one checked', async () => {
    const storage = storageWithOneNoteReading()
    openPage(storage)
    await startSession('20')
    await answerRight()
    reload(storage)

    await pressInBlock(EN.continue)

    expect(queryProgressBar('Question 2 of 20')).not.toBeNull()
    expect(queryText('Accuracy 100%')).not.toBeNull()
    expect(queryButton('Next')).toBeNull()
  })

  it('opens the results after the last question checked', async () => {
    openPage(storageWithSession({ number: 20, grades: { first: RIGHT, second: null } }))

    await pressInBlock(EN.continue)

    expect(h1('Results')).not.toBeNull()
  })

  it('goes on with the time saved of a session on time', async () => {
    const clock = openPage(withLength({ minutes: 5 }))

    await pressInBlock(EN.continue)

    expect(queryProgressBar('Time: 1:24')).not.toBeNull()
    await clock.elapse(1_000)
    expect(queryProgressBar('Time: 1:25')).not.toBeNull()
  })

  it('goes on with the difficulty of the session, the one chosen kept (edge case 2)', async () => {
    // First steps asks for no duration; the page reads in Confident reading, which does.
    openPage(storageWithSession({ difficulty: presetDifficulty('first-steps') }))

    await pressInBlock(EN.continue)

    expect(queryButton('1/2')).toBeNull()
    await press('Finish')
    await press('New session')
    await startSession('No limit')
    expect(queryButton('1/2')).not.toBeNull()
  })

  it('leaves the block away once back on the choice screen', async () => {
    openPage(storageWithSession())
    await pressInBlock(EN.continue)

    await press('Finish')
    await press('New session')

    expect(blockHeading()).toBeNull()
  })
})

describe('Discard (criterion 12)', () => {
  it('takes the block away', async () => {
    openPage(storageWithSession())

    await pressInBlock(EN.discard)

    expect(blockHeading()).toBeNull()
    expect(block()).toBeNull()
    expect(queryButton(EN.continue)).toBeNull()
    expect(queryText(EN.line)).toBeNull()
  })

  it('moves the focus to the heading of the choice screen', async () => {
    openPage(storageWithSession())

    await pressInBlock(EN.discard)

    await waitFor(() => expect(document.activeElement).toBe(h1('Trainer')))
  })

  it('leaves no session after a reload', async () => {
    const storage = storageWithSession()
    openPage(storage)
    await pressInBlock(EN.discard)

    reload(storage)

    expect(blockHeading()).toBeNull()
  })

  it('happens by the start of a session too', async () => {
    const storage = storageWithSession()
    openPage(storage)

    await startSession('10')
    reload(storage)

    expect(blockHeading()).toBeNull()
  })
})

describe('a session that reached its results (criterion 13)', () => {
  it('leaves no block on the choice screen', async () => {
    const storage = storageWithOneNoteReading()
    openPage(storage)
    await startSession('No limit')
    await answerRight()
    await press('Finish')

    await press('New session')

    expect(blockHeading()).toBeNull()
  })

  it('leaves no block after a reload', async () => {
    const storage = storageWithOneNoteReading()
    openPage(storage)
    await startSession('No limit')
    await answerRight()
    await press('Finish')

    reload(storage)

    expect(blockHeading()).toBeNull()
  })
})

describe('the page hidden (criterion 11)', () => {
  async function timedSessionLeftAt(clock: ManualClock, storage: KeyValueStorage) {
    openPage(storage, { clock })
    await startSession('5 min')
    await answerRight()
    await clock.elapse(84_000)
  }

  it('saves the time passed as the page is left', async () => {
    const storage = storageWithOneNoteReading()
    await timedSessionLeftAt(createManualClock(), storage)

    window.dispatchEvent(new Event('pagehide'))
    reload(storage)

    expect(queryText('Read notes · Time: 1:24 · 100%')).not.toBeNull()
  })

  it('saves the time passed as the page is hidden', async () => {
    const storage = storageWithOneNoteReading()
    await timedSessionLeftAt(createManualClock(), storage)

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    reload(storage)

    expect(queryText('Read notes · Time: 1:24 · 100%')).not.toBeNull()
  })

  it('keeps the time of the last check without either', async () => {
    const storage = storageWithOneNoteReading()
    await timedSessionLeftAt(createManualClock(), storage)

    reload(storage)

    expect(queryText('Read notes · Time: 0:00 · 100%')).not.toBeNull()
  })
})

// Feature staff-progress-row, slice 4: Continue brings back the notes passed in the row before the
// reload, with the marks of their first attempts (criterion 13); a session saved before the row
// goes on with none left of the question (edge case 4).
describe('the row of the session brought back by Continue', () => {
  const staff = () => screen.getByRole('img', { name: 'Music staff' })

  function drawingOf(name: IconName): string {
    const host = document.createElement('div')
    const app = createApp({ render: () => h(UiIcon, { name }) })
    app.mount(host)
    const drawing = host.querySelector('svg')?.innerHTML ?? ''
    app.unmount()
    return drawing
  }

  // The icons by the staff, in their order, the stub of the staff drawing none of its own.
  const marks = () =>
    [...(staff().parentElement?.querySelectorAll('svg') ?? [])].map((icon) => {
      const drawing = icon.innerHTML
      if (drawing === drawingOf('check')) return '✓'
      if (drawing === drawingOf('cross')) return '✗'
      return '?'
    })

  it('gives the notes passed before the reload with their marks', async () => {
    const storage = storageWithOneNoteReading()
    openPage(storage)
    await startSession('20')
    await answerRight()
    await press('Next')
    await answerWrongTwice()
    await press('Next')
    reload(storage)

    await pressInBlock(EN.continue)

    expect(queryProgressBar('Question 3 of 20')).not.toBeNull()
    expect(staff().getAttribute('data-passed')).toBe('C4 D4')
    expect(shownPitch()).toBe('C4')
    expect(marks()).toEqual(['✓', '✗'])
  })

  it('passes the question checked before the reload into the row', async () => {
    const storage = storageWithOneNoteReading()
    openPage(storage)
    await startSession('20')
    await answerRight()
    await press('Next')
    await answerWrongTwice()
    reload(storage)

    await pressInBlock(EN.continue)

    expect(queryProgressBar('Question 3 of 20')).not.toBeNull()
    expect(staff().getAttribute('data-passed')).toBe('C4 D4')
    expect(marks()).toEqual(['✓', '✗'])
  })

  it('gives the notes passed as the page is left on a question not checked', async () => {
    const storage = storageWithOneNoteReading()
    openPage(storage)
    await startSession('20')
    await answerRight()
    await press('Next')
    await answer('re')
    await press('Next')
    await press('do')

    window.dispatchEvent(new Event('pagehide'))
    reload(storage)
    await pressInBlock(EN.continue)

    expect(staff().getAttribute('data-passed')).toBe('C4 D4')
    expect(marks()).toEqual(['✓', '✓'])
  })

  it('gives none left of the question of a session saved before the row (edge case 4)', async () => {
    openPage(storageWithSession())

    await pressInBlock(EN.continue)

    expect(shownPitch()).toBe('E4')
    expect(staff().getAttribute('data-passed')).toBe('')
    expect(marks()).toEqual([])
  })
})
