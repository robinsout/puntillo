import { describe, expect, it } from 'vitest'
import type { FileSaver, KeyValueStorage, WallClock } from '@/application/ports'
import { createPreferences, type Preferences } from '@/application/preferences'
import { createProgress, createProgressTransfer, type Progress } from '@/application/progress'
import { presetDifficulty } from '@/domain/difficulty'
import {
  NO_HISTORY,
  NO_STATISTICS,
  parseProgressFile,
  serializeProgressFile,
  type ItemStatistics,
  type ProgressFile,
  type SavedSession,
  type SessionHistory,
  type SessionSummary,
} from '@/domain/progress'
import { createQuestion, type Duration } from '@/domain/question'
import { EMPTY_REVIEW_QUEUE, type ReviewItem } from '@/domain/review-queue'
import { EMPTY_SCORE, NO_MISTAKES, recordGrade } from '@/domain/session'

// Feature progress-and-storage, slice 4: Export progress saves a file of all that is kept, named
// by the day of the device (criterion 14), empty parts and all (edge case 5); a file read is
// either a progress file or turned down (criteria 15, 17); Replace puts the file in place of all
// that is kept, the preferences as well as the progress, both on the page and in the storage
// (criterion 16), a session not finished dropped when the file has none (edge case 3), and kept
// on the page alone when the storage cannot save (edge case 4). The file itself is the domain's,
// see domain/progress.
//
// Tests do not depend on the storage keys: a reload is new preferences and a new progress over
// the same storage.

const QUARTER: Duration = { value: 'quarter' }
const C4: ReviewItem = { pitch: { letter: 'C', octave: 4 }, duration: QUARTER }
const F_SHARP_4: ReviewItem = {
  pitch: { letter: 'F', octave: 4, alteration: 1 },
  duration: QUARTER,
}

const OCT_13_2026 = Date.UTC(2026, 9, 13, 12)
const DAY = 24 * 60 * 60 * 1000

const READ_20: SessionSummary = { exercise: 'read', length: 20, questions: 20, accuracy: 85 }

// A session of 20 left on its seventh question, not checked yet.
const SAVED: SavedSession = {
  exercise: 'read',
  length: 20,
  difficulty: presetDifficulty('confident-reading'),
  attempts: 2,
  number: 7,
  elapsedMs: 84_000,
  score: recordGrade(EMPTY_SCORE, [{ pitch: true, duration: false }], 2_000),
  mistakes: NO_MISTAKES,
  reviewQueue: EMPTY_REVIEW_QUEUE,
  question: createQuestion({ pitch: { letter: 'G', octave: 4 }, duration: QUARTER }),
  grades: null,
}

const FILE_STATISTICS: ItemStatistics = {
  items: [
    { item: F_SHARP_4, shown: 12, mistakes: 3, lastShownAt: OCT_13_2026 - DAY, lastRight: false },
  ],
}

const FILE_HISTORY: SessionHistory = {
  sessions: [
    {
      finishedAt: OCT_13_2026 - DAY,
      exercise: 'write',
      length: { minutes: 5 },
      questions: 12,
      accuracy: 67,
    },
  ],
}

// Of another device: every preference saved, other than those of a new user.
const FILE: ProgressFile = {
  preferences: {
    language: 'ru',
    noteNaming: 'letter',
    seventhNote: 'H',
    autoAdvance: true,
    showAnswerAtOnce: true,
    preset: 'confident-reading',
    difficulty: presetDifficulty('advanced'),
    exercise: 'write',
    showNoteNames: true,
    noteInput: 'keyboard',
    playKeys: false,
    shortcutsHintClosed: true,
    useMidi: true,
    midiSound: true,
    sessionLength: { minutes: 5 },
  },
  statistics: FILE_STATISTICS,
  history: FILE_HISTORY,
  session: SAVED,
}

function memoryStorage(): KeyValueStorage {
  const entries = new Map<string, string>()
  return {
    get: (key) => entries.get(key) ?? null,
    set: (key, value) => {
      entries.set(key, value)
    },
    canSave: () => true,
  }
}

// What the storage port promises when the browser storage is unavailable.
const unavailableStorage = (): KeyValueStorage => ({
  get: () => null,
  set: () => {},
  canSave: () => false,
})

const wallClock = (at = OCT_13_2026): WallClock => ({ now: () => at })

interface Saved {
  readonly name: string
  readonly text: string
}

function recordingSaver() {
  const saved: Saved[] = []
  const saver: FileSaver = {
    save(name, text) {
      saved.push({ name, text })
    },
  }
  return { saver, saved }
}

interface Page {
  readonly preferences: Preferences
  readonly progress: Progress
}

// A page load over the storage: preferences, progress and the transfer between them and a file.
function load(
  storage: KeyValueStorage = memoryStorage(),
  {
    browserLanguages = ['en'],
    at = OCT_13_2026,
  }: { browserLanguages?: string[]; at?: number } = {},
) {
  const clock = wallClock(at)
  const preferences = createPreferences(storage, browserLanguages)
  const progress = createProgress(storage, clock)
  const { saver, saved } = recordingSaver()
  const transfer = createProgressTransfer(preferences, progress, clock, saver)
  return { storage, preferences, progress, transfer, saved }
}

function onlySaved(saved: readonly Saved[]): Saved {
  expect(saved).toHaveLength(1)
  const [file] = saved
  if (!file) throw new Error('no file saved')
  return file
}

function exported(page: ReturnType<typeof load>): ProgressFile {
  page.transfer.exportProgress()
  const read = parseProgressFile(onlySaved(page.saved).text)
  if (!read) throw new Error('the exported file is not read back')
  return read
}

function preferencesOf({ preferences }: Page) {
  return {
    language: preferences.language,
    noteNaming: preferences.noteNaming,
    seventhNote: preferences.seventhNote,
    autoAdvance: preferences.autoAdvance,
    showAnswerAtOnce: preferences.showAnswerAtOnce,
    preset: preferences.preset,
    difficulty: preferences.difficulty,
    exercise: preferences.exercise,
    showNoteNames: preferences.showNoteNames,
    noteInput: preferences.noteInput,
    playKeys: preferences.playKeys,
    shortcutsHintClosed: preferences.shortcutsHintClosed,
    useMidi: preferences.useMidi,
    midiSound: preferences.midiSound,
    sessionLength: preferences.sessionLength,
  }
}

const NEW_USER = {
  language: 'en',
  noteNaming: 'latin-syllable',
  seventhNote: 'B',
  autoAdvance: false,
  showAnswerAtOnce: false,
  preset: 'first-steps',
  difficulty: presetDifficulty('first-steps'),
  exercise: 'read',
  showNoteNames: false,
  noteInput: 'names',
  playKeys: true,
  shortcutsHintClosed: false,
  useMidi: false,
  midiSound: false,
  sessionLength: 10,
}

function imported(file: ProgressFile, page = load()) {
  const read = page.transfer.readProgressFile(serializeProgressFile(file))
  if (!read) throw new Error('the file is not read')
  page.transfer.importProgress(read)
  return page
}

describe('Export progress (criterion 14)', () => {
  it('saves one file named by the day', () => {
    const page = load()

    page.transfer.exportProgress()

    expect(onlySaved(page.saved).name).toBe('puntillo-progress-2026-10-13.json')
  })

  it.each([
    ['late in the evening', new Date(2026, 9, 13, 23, 59).getTime(), '2026-10-13'],
    ['just after midnight', new Date(2026, 9, 14, 0, 1).getTime(), '2026-10-14'],
    ['on a day and a month of one digit', new Date(2026, 0, 5, 12).getTime(), '2026-01-05'],
  ])('names the file by the date of the device %s', (_when, at, date) => {
    const page = load(memoryStorage(), { at })

    page.transfer.exportProgress()

    expect(onlySaved(page.saved).name).toBe(`puntillo-progress-${date}.json`)
  })

  it('writes a progress file', () => {
    const page = load()

    page.transfer.exportProgress()

    expect(parseProgressFile(onlySaved(page.saved).text)).not.toBeNull()
  })

  it('writes every preference as chosen', () => {
    const page = load()
    page.preferences.chooseLanguage('es')
    page.preferences.chooseNoteNaming('letter')
    page.preferences.chooseSeventhNote('H')
    page.preferences.chooseAutoAdvance(true)
    page.preferences.chooseShowAnswerAtOnce(true)
    page.preferences.choosePreset('confident-reading')
    page.preferences.customize({ questionLength: 'one-note' })
    page.preferences.chooseExercise('write')
    page.preferences.chooseShowNoteNames(true)
    page.preferences.chooseNoteInput('keyboard')
    page.preferences.choosePlayKeys(false)
    page.preferences.closeShortcutsHint()
    page.preferences.chooseSessionLength('unlimited')

    expect(exported(page).preferences).toEqual(preferencesOf(page))
  })

  // Feature navigation-and-settings, criterion 14.
  it('writes the session length chosen', () => {
    const page = load()
    page.preferences.chooseSessionLength({ minutes: 3 })

    expect(exported(page).preferences.sessionLength).toEqual({ minutes: 3 })
  })

  it('writes the statistics of every item, not only the hardest', () => {
    const page = load()
    const items: ReviewItem[] = (['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const).flatMap((letter) => [
      { pitch: { letter, octave: 4 }, duration: QUARTER },
      { pitch: { letter, octave: 5 }, duration: QUARTER },
    ])
    page.progress.recordAnswers(items.map((item) => ({ item, right: false })))

    expect(exported(page).statistics.items.map(({ item }) => item)).toEqual(items)
  })

  it('writes the history and the session not finished', () => {
    const page = load()
    page.progress.recordAnswers([{ item: C4, right: false }])
    page.progress.recordSession(READ_20)
    page.progress.saveSession(SAVED)

    const file = exported(page)

    expect(file.statistics.items).toEqual([
      { item: C4, shown: 1, mistakes: 1, lastShownAt: OCT_13_2026, lastRight: false },
    ])
    expect(file.history).toEqual({ sessions: [{ finishedAt: OCT_13_2026, ...READ_20 }] })
    expect(file.session).toEqual(SAVED)
  })

  it('writes the preferences of a new user and empty parts when nothing is kept yet (edge case 5)', () => {
    const file = exported(load())

    expect(file).toEqual({
      preferences: NEW_USER,
      statistics: NO_STATISTICS,
      history: NO_HISTORY,
      session: null,
    })
  })

  it('writes what is kept on the page when the storage cannot save', () => {
    const page = load(unavailableStorage())
    page.preferences.chooseNoteNaming('letter')
    page.progress.recordSession(READ_20)

    const file = exported(page)

    expect(file.preferences.noteNaming).toBe('letter')
    expect(file.history.sessions).toHaveLength(1)
  })
})

describe('a file read before Replace (criteria 15, 17)', () => {
  it('is the progress of the file', () => {
    const { transfer } = load()

    expect(transfer.readProgressFile(serializeProgressFile(FILE))).toEqual(FILE)
  })

  it.each([
    ['not JSON', 'not a progress file'],
    ['JSON of something else', JSON.stringify({ app: 'other', version: 1 })],
  ])('is none when %s', (_what, text) => {
    const { transfer } = load()

    expect(transfer.readProgressFile(text)).toBeNull()
  })

  it('changes nothing', () => {
    const page = load()
    page.progress.recordSession(READ_20)

    page.transfer.readProgressFile(serializeProgressFile(FILE))

    expect(preferencesOf(page)).toEqual(NEW_USER)
    expect(page.progress.recentSessions).toHaveLength(1)
    expect(page.progress.recentSessions[0]?.exercise).toBe('read')
  })
})

describe('Replace (criterion 16)', () => {
  it('takes every preference of the file', () => {
    const page = imported(FILE)

    expect(preferencesOf(page)).toEqual(FILE.preferences)
  })

  it('takes the statistics, the history and the session of the file', () => {
    const page = imported(FILE)

    expect(page.progress.hardestNotes).toEqual(FILE_STATISTICS.items)
    expect(page.progress.recentSessions).toEqual(FILE_HISTORY.sessions)
    expect(page.progress.unfinishedSession).toEqual(SAVED)
  })

  it('drops what was kept before rather than adding the file to it', () => {
    const page = load()
    page.progress.recordAnswers([{ item: C4, right: false }])
    page.progress.recordSession(READ_20)

    imported(FILE, page)

    expect(page.progress.hardestNotes.map(({ item }) => item)).toEqual([F_SHARP_4])
    expect(page.progress.recentSessions).toEqual(FILE_HISTORY.sessions)
  })

  it('goes on counting from the statistics of the file', () => {
    const page = imported(FILE)

    page.progress.recordAnswers([{ item: F_SHARP_4, right: false }])

    expect(page.progress.hardestNotes[0]).toMatchObject({ item: F_SHARP_4, shown: 13, mistakes: 4 })
  })

  it('keeps all of it over a reload', () => {
    const { storage } = imported(FILE)

    const reloaded = load(storage)

    expect(preferencesOf(reloaded)).toEqual(FILE.preferences)
    expect(reloaded.progress.hardestNotes).toEqual(FILE_STATISTICS.items)
    expect(reloaded.progress.recentSessions).toEqual(FILE_HISTORY.sessions)
    expect(reloaded.progress.unfinishedSession).toEqual(SAVED)
  })

  it('exports again the file it took', () => {
    const page = imported(FILE)

    expect(exported(page)).toEqual(FILE)
  })

  it('drops the session not finished when the file has none (edge case 3)', () => {
    const page = load()
    page.progress.saveSession(SAVED)

    imported({ ...FILE, session: null }, page)

    expect(page.progress.unfinishedSession).toBeNull()
    expect(load(page.storage).progress.unfinishedSession).toBeNull()
  })

  it('takes empty progress from a file of empty progress', () => {
    const page = load()
    page.progress.recordAnswers([{ item: C4, right: false }])
    page.progress.recordSession(READ_20)

    imported({ ...FILE, statistics: NO_STATISTICS, history: NO_HISTORY, session: null }, page)

    expect(page.progress.hardestNotes).toEqual([])
    expect(page.progress.recentSessions).toEqual([])
    expect(load(page.storage).progress.recentSessions).toEqual([])
  })
})

describe('Replace with preferences left out of the file', () => {
  const EMPTY: ProgressFile = {
    preferences: {},
    statistics: NO_STATISTICS,
    history: NO_HISTORY,
    session: null,
  }

  it('takes the defaults for them, the language of the browser among them', () => {
    const page = load(memoryStorage(), { browserLanguages: ['es'] })
    page.preferences.chooseLanguage('ru')
    page.preferences.chooseNoteNaming('letter')
    page.preferences.chooseAutoAdvance(true)
    page.preferences.choosePreset('advanced')
    page.preferences.chooseExercise('write')
    page.preferences.chooseNoteInput('keyboard')
    page.preferences.choosePlayKeys(false)
    page.preferences.closeShortcutsHint()
    page.preferences.chooseSessionLength(50)

    imported(EMPTY, page)

    expect(preferencesOf(page)).toEqual({ ...NEW_USER, language: 'es' })
  })

  it('takes the difficulty of the preset of the file when the file has no difficulty', () => {
    const page = load()
    page.preferences.choosePreset('advanced')
    page.preferences.customize({ questionLength: 'one-note' })

    imported({ ...EMPTY, preferences: { preset: 'confident-reading' } }, page)

    expect(page.preferences.preset).toBe('confident-reading')
    expect(page.preferences.difficulty).toEqual(presetDifficulty('confident-reading'))
    expect(page.preferences.modified).toBe(false)
  })

  it('takes the difficulty of the file over First steps when the file has no preset', () => {
    const page = imported({ ...EMPTY, preferences: { difficulty: presetDifficulty('advanced') } })

    expect(page.preferences.preset).toBe('first-steps')
    expect(page.preferences.difficulty).toEqual(presetDifficulty('advanced'))
    expect(page.preferences.modified).toBe(true)
  })

  // Feature navigation-and-settings, edge case 2: a file exported before the session length was
  // saved.
  it('takes the session length of 10 from a file written before it', () => {
    const page = load()
    page.preferences.chooseSessionLength({ minutes: 10 })
    const { sessionLength: _left, ...before } = FILE.preferences

    imported({ ...FILE, preferences: before }, page)

    expect(page.preferences.sessionLength).toBe(10)
    expect(load(page.storage).preferences.sessionLength).toBe(10)
  })

  it('keeps the defaults over a reload', () => {
    const page = load()
    page.preferences.chooseNoteNaming('letter')
    page.preferences.choosePreset('advanced')

    imported(EMPTY, page)
    const reloaded = load(page.storage)

    expect(reloaded.preferences.noteNaming).toBe('latin-syllable')
    expect(reloaded.preferences.preset).toBe('first-steps')
    expect(reloaded.preferences.difficulty).toEqual(presetDifficulty('first-steps'))
  })
})

describe('Replace when the storage cannot save (edge case 4)', () => {
  it('takes the file on the page', () => {
    const page = imported(FILE, load(unavailableStorage()))

    expect(preferencesOf(page)).toEqual(FILE.preferences)
    expect(page.progress.recentSessions).toEqual(FILE_HISTORY.sessions)
    expect(page.progress.unfinishedSession).toEqual(SAVED)
  })

  it('still says it cannot save', () => {
    const page = imported(FILE, load(unavailableStorage()))

    expect(page.preferences.canSave).toBe(false)
    expect(page.progress.canSave).toBe(false)
  })
})
