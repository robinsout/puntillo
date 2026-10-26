import { describe, expect, it } from 'vitest'
import { presetDifficulty, serializeDifficulty } from '@/domain/difficulty'
import {
  NO_HISTORY,
  NO_STATISTICS,
  parseProgressFile,
  serializeProgressFile,
  serializeHistory,
  serializeSavedSession,
  serializeStatistics,
  type ItemStatistics,
  type ProgressFile,
  type SavedSession,
  type SessionHistory,
} from '@/domain/progress'
import { createQuestion } from '@/domain/question'
import { EMPTY_REVIEW_QUEUE } from '@/domain/review-queue'
import { EMPTY_SCORE, NO_MISTAKES, recordGrade } from '@/domain/session'

// Feature progress-and-storage, slice 4: the progress moves to another device as a file
// (criteria 14, 16), and a file that is not JSON, not a progress of Puntillo or holds a value out
// of bounds is turned down as a whole (criterion 17).
//
// The file is readable JSON: { app: 'puntillo', version: 1, preferences, statistics, history,
// session }. preferences holds the saved preferences, each one optional: one left out is not
// saved and reads as its default; the difficulty is written as the preferences write it
// (serializeDifficulty). statistics, history and session are written each as its own text is
// (serializeStatistics, serializeHistory, serializeSavedSession), session null for none.

const OCT_13_2026 = Date.UTC(2026, 9, 13, 12)
const DAY = 24 * 60 * 60 * 1000

const ADVANCED = presetDifficulty('advanced')

const STATISTICS: ItemStatistics = {
  items: [
    {
      item: { pitch: { letter: 'F', octave: 4, alteration: 1 }, duration: { value: 'quarter' } },
      shown: 12,
      mistakes: 3,
      lastShownAt: OCT_13_2026,
      lastRight: false,
    },
    {
      item: { pitch: { letter: 'C', octave: 5 }, duration: { value: 'half', dots: 1 } },
      shown: 2,
      mistakes: 0,
      lastShownAt: OCT_13_2026 - DAY,
      lastRight: true,
    },
  ],
}

const HISTORY: SessionHistory = {
  sessions: [
    {
      finishedAt: OCT_13_2026 - DAY,
      exercise: 'read',
      length: 20,
      questions: 20,
      accuracy: 85,
    },
    {
      finishedAt: OCT_13_2026,
      exercise: 'write',
      length: { minutes: 5 },
      questions: 12,
      accuracy: 67,
    },
  ],
}

// A session of 20 left on its seventh question, not checked yet.
const SESSION: SavedSession = {
  exercise: 'read',
  length: 20,
  difficulty: presetDifficulty('confident-reading'),
  attempts: 2,
  number: 7,
  elapsedMs: 84_000,
  score: recordGrade(EMPTY_SCORE, [{ pitch: true, duration: false }], 2_000),
  mistakes: NO_MISTAKES,
  reviewQueue: EMPTY_REVIEW_QUEUE,
  question: createQuestion({ pitch: { letter: 'G', octave: 4 }, duration: { value: 'quarter' } }),
  grades: null,
}

const FILE: ProgressFile = {
  preferences: {
    language: 'ru',
    noteNaming: 'letter',
    seventhNote: 'H',
    autoAdvance: true,
    showAnswerAtOnce: true,
    preset: 'advanced',
    difficulty: ADVANCED,
    exercise: 'write',
    showNoteNames: true,
  },
  statistics: STATISTICS,
  history: HISTORY,
  session: SESSION,
}

const fieldsOfText = (text: string): unknown => JSON.parse(text)

// FILE as it is written.
const FILE_FIELDS = {
  app: 'puntillo',
  version: 1,
  preferences: {
    language: 'ru',
    noteNaming: 'letter',
    seventhNote: 'H',
    autoAdvance: true,
    showAnswerAtOnce: true,
    preset: 'advanced',
    difficulty: fieldsOfText(serializeDifficulty(ADVANCED)),
    exercise: 'write',
    showNoteNames: true,
  },
  statistics: fieldsOfText(serializeStatistics(STATISTICS)),
  history: fieldsOfText(serializeHistory(HISTORY)),
  session: fieldsOfText(serializeSavedSession(SESSION)),
}

type Fields = Record<string, unknown>

const text = (fields: unknown): string => JSON.stringify(fields)

const withField = (name: string, value: unknown): Fields => ({ ...FILE_FIELDS, [name]: value })

function withoutField(name: string): Fields {
  const { [name]: _left, ...rest } = FILE_FIELDS as Fields
  return rest
}

const withPreference = (name: string, value: unknown): Fields =>
  withField('preferences', { ...FILE_FIELDS.preferences, [name]: value })

describe('the progress file as written', () => {
  it('is read back as it was', () => {
    expect(parseProgressFile(serializeProgressFile(FILE))).toEqual(FILE)
  })

  it('is read back without a session not finished', () => {
    const file: ProgressFile = { ...FILE, session: null }

    expect(parseProgressFile(serializeProgressFile(file))).toEqual(file)
  })

  it('is read back with empty progress and no saved preferences', () => {
    const file: ProgressFile = {
      preferences: {},
      statistics: NO_STATISTICS,
      history: NO_HISTORY,
      session: null,
    }

    expect(parseProgressFile(serializeProgressFile(file))).toEqual(file)
  })

  it('names the app and the version, and writes each part as its own text', () => {
    expect(JSON.parse(serializeProgressFile(FILE))).toEqual(FILE_FIELDS)
  })

  it('writes session null for none', () => {
    expect(JSON.parse(serializeProgressFile({ ...FILE, session: null }))).toEqual({
      ...FILE_FIELDS,
      session: null,
    })
  })

  it('is indented, to be read by a person', () => {
    const written = serializeProgressFile(FILE)

    expect(written).toBe(JSON.stringify(JSON.parse(written), null, 2))
  })
})

describe('a progress file read', () => {
  it('gives the preferences, the statistics, the history and the session', () => {
    expect(parseProgressFile(text(FILE_FIELDS))).toEqual(FILE)
  })

  it('reads a session null as none', () => {
    expect(parseProgressFile(text(withField('session', null)))).toEqual({ ...FILE, session: null })
  })

  it('reads empty preferences as none saved', () => {
    expect(parseProgressFile(text(withField('preferences', {})))?.preferences).toEqual({})
  })

  it('reads some of the preferences, leaving the others not saved', () => {
    const read = parseProgressFile(
      text(withField('preferences', { language: 'es', preset: 'first-steps' })),
    )

    expect(read?.preferences).toEqual({ language: 'es', preset: 'first-steps' })
  })

  // Feature piano-keyboard, criterion 16: the note input goes into the file and back.
  // Feature microphone-input, criterion 1: the microphone too.
  it.each(['names', 'keyboard', 'microphone'] as const)('reads the note input %j', (noteInput) => {
    const read = parseProgressFile(text(withField('preferences', { noteInput })))

    expect(read?.preferences).toEqual({ noteInput })
  })

  it('writes the note input and reads it back', () => {
    const file: ProgressFile = {
      ...FILE,
      preferences: { ...FILE.preferences, noteInput: 'keyboard' },
    }

    expect(JSON.parse(serializeProgressFile(file)).preferences.noteInput).toBe('keyboard')
    expect(parseProgressFile(serializeProgressFile(file))).toEqual(file)
  })

  it('reads a file without the note input, as written before it, as not saved', () => {
    expect(parseProgressFile(text(FILE_FIELDS))?.preferences).not.toHaveProperty('noteInput')
  })

  // Feature microphone-input, criterion 2: the tuning of the instrument goes into the file and
  // back.
  it.each(['c', 'b-flat'] as const)('reads the tuning %j', (tuning) => {
    const read = parseProgressFile(text(withField('preferences', { tuning })))

    expect(read?.preferences).toEqual({ tuning })
  })

  it('writes the tuning and reads it back', () => {
    const file: ProgressFile = {
      ...FILE,
      preferences: { ...FILE.preferences, noteInput: 'microphone', tuning: 'b-flat' },
    }

    expect(JSON.parse(serializeProgressFile(file)).preferences.tuning).toBe('b-flat')
    expect(parseProgressFile(serializeProgressFile(file))).toEqual(file)
  })

  it('reads a file without the tuning, as written before it, as not saved', () => {
    expect(parseProgressFile(text(FILE_FIELDS))?.preferences).not.toHaveProperty('tuning')
  })

  // Feature piano-keyboard, criterion 16: the sound of the keys goes into the file and back.
  it.each([true, false])('reads the sound of the keys %j', (playKeys) => {
    const read = parseProgressFile(text(withField('preferences', { playKeys })))

    expect(read?.preferences).toEqual({ playKeys })
  })

  it('writes the sound of the keys and reads it back', () => {
    const file: ProgressFile = {
      ...FILE,
      preferences: { ...FILE.preferences, playKeys: false },
    }

    expect(JSON.parse(serializeProgressFile(file)).preferences.playKeys).toBe(false)
    expect(parseProgressFile(serializeProgressFile(file))).toEqual(file)
  })

  it('reads a file without the sound of the keys, as written before it, as not saved', () => {
    expect(parseProgressFile(text(FILE_FIELDS))?.preferences).not.toHaveProperty('playKeys')
  })

  // Feature keyboard-shortcuts, criterion 13: the hint about the keys, once closed, is saved as
  // the preferences are, so it goes into the file and back.
  it.each([true, false])('reads the hint about the keys closed %j', (shortcutsHintClosed) => {
    const read = parseProgressFile(text(withField('preferences', { shortcutsHintClosed })))

    expect(read?.preferences).toEqual({ shortcutsHintClosed })
  })

  it('writes the hint about the keys closed and reads it back', () => {
    const file: ProgressFile = {
      ...FILE,
      preferences: { ...FILE.preferences, shortcutsHintClosed: true },
    }

    expect(JSON.parse(serializeProgressFile(file)).preferences.shortcutsHintClosed).toBe(true)
    expect(parseProgressFile(serializeProgressFile(file))).toEqual(file)
  })

  it('reads a file without the hint about the keys, as written before it, as not saved', () => {
    expect(parseProgressFile(text(FILE_FIELDS))?.preferences).not.toHaveProperty(
      'shortcutsHintClosed',
    )
  })

  // Feature midi-input, criteria 1 and 7: the MIDI keyboard and its sound go into the file and
  // back.
  it.each([
    ['useMidi', true],
    ['useMidi', false],
    ['midiSound', true],
    ['midiSound', false],
  ] as const)('reads the preference %s %j', (name, value) => {
    const read = parseProgressFile(text(withField('preferences', { [name]: value })))

    expect(read?.preferences).toEqual({ [name]: value })
  })

  it('writes the MIDI keyboard and its sound and reads them back', () => {
    const file: ProgressFile = {
      ...FILE,
      preferences: { ...FILE.preferences, useMidi: true, midiSound: true },
    }

    const written = JSON.parse(serializeProgressFile(file)).preferences
    expect(written.useMidi).toBe(true)
    expect(written.midiSound).toBe(true)
    expect(parseProgressFile(serializeProgressFile(file))).toEqual(file)
  })

  it('reads a file without the MIDI keyboard, as written before it, as not saved', () => {
    const preferences = parseProgressFile(text(FILE_FIELDS))?.preferences

    expect(preferences).not.toHaveProperty('useMidi')
    expect(preferences).not.toHaveProperty('midiSound')
  })

  // Feature navigation-and-settings, criterion 14: the session length chosen on the start screen
  // goes into the file and back; a file written before it has none (edge case 2).
  it.each([10, 20, 50, 'unlimited', { minutes: 3 }, { minutes: 5 }, { minutes: 10 }] as const)(
    'reads the session length %j',
    (sessionLength) => {
      const read = parseProgressFile(text(withField('preferences', { sessionLength })))

      expect(read?.preferences).toEqual({ sessionLength })
    },
  )

  it('writes the session length and reads it back', () => {
    const file: ProgressFile = {
      ...FILE,
      preferences: { ...FILE.preferences, sessionLength: { minutes: 5 } },
    }

    expect(JSON.parse(serializeProgressFile(file)).preferences.sessionLength).toEqual({
      minutes: 5,
    })
    expect(parseProgressFile(serializeProgressFile(file))).toEqual(file)
  })

  it('reads a file without the session length, as written before it, as not saved', () => {
    expect(parseProgressFile(text(FILE_FIELDS))?.preferences).not.toHaveProperty('sessionLength')
  })

  it('reads a difficulty without a preset', () => {
    const difficulty = fieldsOfText(serializeDifficulty(ADVANCED))

    const read = parseProgressFile(text(withField('preferences', { difficulty })))

    expect(read?.preferences).toEqual({ difficulty: ADVANCED })
  })
})

describe('a file turned down as a whole', () => {
  it.each([
    ['text that is not JSON', 'not a progress file'],
    ['an empty text', ''],
    ['JSON null', 'null'],
    ['a JSON array', '[]'],
    ['a JSON string', '"puntillo"'],
    ['a JSON number', '1'],
  ])('%s', (_what, written) => {
    expect(parseProgressFile(written)).toBeNull()
  })

  it.each([
    ['without the app', withoutField('app')],
    ['of another app', withField('app', 'other')],
    ['without the version', withoutField('version')],
    ['of another version', withField('version', 2)],
    ['of the version as text', withField('version', '1')],
    ['without the preferences', withoutField('preferences')],
    ['with the preferences null', withField('preferences', null)],
    ['with the preferences a list', withField('preferences', [])],
    ['without the statistics', withoutField('statistics')],
    ['with the statistics null', withField('statistics', null)],
    ['with the statistics of another version', withField('statistics', { version: 2, items: [] })],
    [
      'with an item of the statistics out of bounds',
      withField('statistics', {
        version: 1,
        items: [{ ...STATISTICS.items[0], mistakes: 13 }],
      }),
    ],
    ['without the history', withoutField('history')],
    ['with the history a list', withField('history', [])],
    ['with the history of another version', withField('history', { version: 2, sessions: [] })],
    [
      'with a session of the history out of bounds',
      withField('history', { version: 1, sessions: [{ ...HISTORY.sessions[0], accuracy: 101 }] }),
    ],
    ['without the session', withoutField('session')],
    ['with the session as text', withField('session', 'none')],
    ['with the session a number', withField('session', 0)],
    [
      'with the session of another version',
      withField('session', { ...(FILE_FIELDS.session as Fields), version: 2 }),
    ],
    [
      'with the session damaged',
      withField('session', { ...(FILE_FIELDS.session as Fields), number: 21 }),
    ],
  ])('a file %s', (_what, fields) => {
    expect(parseProgressFile(text(fields))).toBeNull()
  })

  it.each([
    ['language', 'fr'],
    ['language', 1],
    ['language', null],
    ['noteNaming', 'solfege'],
    ['noteNaming', true],
    ['seventhNote', 'C'],
    ['seventhNote', 7],
    ['autoAdvance', 'true'],
    ['autoAdvance', 1],
    ['showAnswerAtOnce', 'false'],
    ['showAnswerAtOnce', null],
    ['preset', 'expert'],
    ['preset', 0],
    ['difficulty', { ...(FILE_FIELDS.preferences.difficulty as Fields), low: 'Z9' }],
    ['difficulty', serializeDifficulty(ADVANCED)],
    ['difficulty', null],
    ['difficulty', []],
    ['exercise', 'listen'],
    ['exercise', false],
    ['showNoteNames', 'yes'],
    ['showNoteNames', null],
    ['noteInput', 'piano'],
    ['noteInput', 'Keyboard'],
    ['noteInput', 'Microphone'],
    ['noteInput', 'mic'],
    ['noteInput', 1],
    ['noteInput', null],
    ['tuning', 'C'],
    ['tuning', 'B-flat'],
    ['tuning', 'bb'],
    ['tuning', 'e-flat'],
    ['tuning', 1],
    ['tuning', null],
    ['playKeys', 'true'],
    ['playKeys', 0],
    ['playKeys', null],
    ['shortcutsHintClosed', 'true'],
    ['shortcutsHintClosed', 1],
    ['shortcutsHintClosed', null],
    ['useMidi', 'true'],
    ['useMidi', 1],
    ['useMidi', null],
    ['midiSound', 'false'],
    ['midiSound', 0],
    ['midiSound', null],
    ['sessionLength', 15],
    ['sessionLength', 0],
    ['sessionLength', '10'],
    ['sessionLength', 'Unlimited'],
    ['sessionLength', { minutes: 4 }],
    ['sessionLength', { minutes: '5' }],
    ['sessionLength', {}],
    ['sessionLength', []],
    ['sessionLength', null],
  ])('a file with the preference %s %j', (name, value) => {
    expect(parseProgressFile(text(withPreference(name, value)))).toBeNull()
  })
})
