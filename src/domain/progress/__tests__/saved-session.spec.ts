import { describe, expect, it } from 'vitest'
import { presetDifficulty, serializeDifficulty } from '@/domain/difficulty'
import { parseSavedSession, serializeSavedSession, type SavedSession } from '@/domain/progress'
import { createQuestionOf, type Grade, type Question } from '@/domain/question'
import { EMPTY_REVIEW_QUEUE, recordQuestion } from '@/domain/review-queue'
import {
  EMPTY_SCORE,
  NO_MISTAKES,
  recordGrade,
  recordMistakes,
  SESSION_LENGTHS,
} from '@/domain/session'

// Feature progress-and-storage, slice 3: a session not finished is kept as text, so that Continue
// brings it back after a reload (criteria 8, 10, 11), and a text damaged or of another version
// reads as none (edge case 1).
//
// The text is JSON: { version: 1, exercise, length, difficulty, attempts, number, elapsedMs, score,
// mistakes, reviewQueue, question, grades }. Each field holds the value of the session as in the
// domain, but for the difficulty, written as the preferences write it (serializeDifficulty), and
// the question, of which only the elements are read: the notes are made from them, as
// createQuestionOf makes them. grades is null while the question on the screen is not checked,
// otherwise { first, second }, second null until a second attempt is checked.

const CONFIDENT_READING = presetDifficulty('confident-reading')

// Three bars in 3/4 with two sharps: rests, a note of the key signature, a dotted one with a
// natural, a flat one; three notes to answer.
const QUESTION: Question = createQuestionOf(
  { beats: 3, beatValue: 4 },
  [
    { duration: { value: 'quarter' } },
    { pitch: { letter: 'F', octave: 4, alteration: 1 }, duration: { value: 'half' } },
    {
      pitch: { letter: 'C', octave: 5 },
      duration: { value: 'half', dots: 1 },
      accidental: 'natural',
    },
    {
      pitch: { letter: 'B', octave: 4, alteration: -1 },
      duration: { value: 'eighth' },
      accidental: 'flat',
    },
    { duration: { value: 'eighth' } },
    { duration: { value: 'half' } },
  ],
  { count: 2, accidental: 'sharp' },
)

const FIRST_GRADE: Grade = [
  { pitch: true, duration: true },
  { pitch: false, duration: true },
  { pitch: true, duration: false },
]
const SECOND_GRADE: Grade = [
  { pitch: true, duration: true },
  { pitch: false, duration: true },
  { pitch: true, duration: true },
]

const C4_QUARTER = { pitch: { letter: 'C', octave: 4 }, duration: { value: 'quarter' } } as const

// A session of 20 on its seventh question, the first six done, an item due again, the question on
// the screen checked twice.
const SAVED: SavedSession = {
  exercise: 'read',
  length: 20,
  difficulty: CONFIDENT_READING,
  attempts: 2,
  number: 7,
  // A monotonic clock reads fractions of a millisecond.
  elapsedMs: 84_000.25,
  score: recordGrade(recordGrade(EMPTY_SCORE, FIRST_GRADE, 4_200.5), SECOND_GRADE, 3_000),
  mistakes: recordMistakes(
    recordMistakes(NO_MISTAKES, [{ item: C4_QUARTER, topics: ['treble-staff'] }]),
    [
      { item: C4_QUARTER, topics: ['durations'] },
      {
        item: { pitch: { letter: 'F', octave: 4, alteration: 1 }, duration: { value: 'half' } },
        topics: ['key-signatures'],
      },
    ],
  ),
  reviewQueue: recordQuestion(EMPTY_REVIEW_QUEUE, QUESTION, FIRST_GRADE, SECOND_GRADE, () => 0.5),
  question: QUESTION,
  grades: { first: FIRST_GRADE, second: SECOND_GRADE },
}

const roundTrip = (saved: SavedSession) => parseSavedSession(serializeSavedSession(saved))

type Path = readonly (string | number)[]

// The saved text with the value at the path replaced; undefined leaves the field out.
function changed(path: Path, value: unknown, saved: SavedSession = SAVED): string {
  const data: unknown = JSON.parse(serializeSavedSession(saved))
  const parent = path
    .slice(0, -1)
    .reduce<unknown>((node, key) => (node as Record<string | number, unknown>)[key], data)
  ;(parent as Record<string | number, unknown>)[path[path.length - 1] as string | number] = value
  return JSON.stringify(data)
}

describe('a saved session', () => {
  describe('kept as text', () => {
    it('reads back as it was saved', () => {
      expect(roundTrip(SAVED)).toEqual(SAVED)
    })

    it.each(SESSION_LENGTHS.map((length) => [JSON.stringify(length), length] as const))(
      'keeps the length %s',
      (_, length) => {
        const saved: SavedSession = { ...SAVED, length, number: 3 }

        expect(roundTrip(saved)).toEqual(saved)
      },
    )

    it('keeps a question not checked yet', () => {
      const saved: SavedSession = { ...SAVED, grades: null }

      expect(roundTrip(saved)).toEqual(saved)
    })

    it('keeps a question checked once, waiting for the second attempt', () => {
      const saved: SavedSession = { ...SAVED, grades: { first: FIRST_GRADE, second: null } }

      expect(roundTrip(saved)).toEqual(saved)
    })

    it('keeps a session of Write notes, one attempt, the duration not asked', () => {
      const firstSteps = presetDifficulty('first-steps')
      const question = createQuestionOf({ beats: 4, beatValue: 4 }, [
        { pitch: { letter: 'G', octave: 4 }, duration: { value: 'whole' } },
      ])
      const grade: Grade = [{ pitch: false, duration: null }]
      const saved: SavedSession = {
        ...SAVED,
        exercise: 'write',
        difficulty: firstSteps,
        attempts: 1,
        question,
        grades: { first: grade, second: null },
        reviewQueue: recordQuestion(EMPTY_REVIEW_QUEUE, question, grade, null, () => 0),
      }

      expect(roundTrip(saved)).toEqual(saved)
    })

    it('keeps a session at its start', () => {
      const saved: SavedSession = {
        ...SAVED,
        number: 1,
        elapsedMs: 0,
        score: EMPTY_SCORE,
        mistakes: NO_MISTAKES,
        reviewQueue: EMPTY_REVIEW_QUEUE,
        grades: null,
      }

      expect(roundTrip(saved)).toEqual(saved)
    })

    it('makes the notes of the question from its elements', () => {
      expect(roundTrip(SAVED)?.question.notes).toEqual(QUESTION.notes)
    })

    it('writes the version and the difficulty as the preferences write it', () => {
      const data = JSON.parse(serializeSavedSession(SAVED))

      expect(data.version).toBe(1)
      expect(data.difficulty).toEqual(JSON.parse(serializeDifficulty(CONFIDENT_READING)))
    })
  })

  describe('damaged or of another version (edge case 1)', () => {
    it.each([
      ['not JSON', '{"version": 1, "exercise": '],
      ['null', 'null'],
      ['a list', '[]'],
      ['a text', '"session"'],
    ])('reads as none: %s', (_, text) => {
      expect(parseSavedSession(text)).toBeNull()
    })

    it.each<[string, Path, unknown]>([
      ['of another version', ['version'], 2],
      ['without a version', ['version'], undefined],
      ['of an unknown exercise', ['exercise'], 'play'],
      ['of an unknown length', ['length'], 15],
      ['of an unknown time', ['length'], { minutes: 4 }],
      ['without a difficulty', ['difficulty'], undefined],
      ['of a difficulty not offered', ['difficulty', 'low'], 'C9'],
      ['of a difficulty as a text', ['difficulty'], serializeDifficulty(CONFIDENT_READING)],
      ['of three attempts', ['attempts'], 3],
      ['of question 0', ['number'], 0],
      ['of a question number not whole', ['number'], 1.5],
      ['past its length', ['number'], 21],
      ['of a negative time', ['elapsedMs'], -1],
      ['of a time as a text', ['elapsedMs'], '84000'],
      ['without a score', ['score'], undefined],
      ['of negative questions checked', ['score', 'checked'], -1],
      ['of more points than possible', ['score', 'points'], 100],
      ['of a streak above the best one', ['score', 'streak'], 5],
      ['without a best streak', ['score', 'bestStreak'], undefined],
      ['of a negative answer time', ['score', 'totalTimeMs'], -5],
      ['of mistakes not a list', ['mistakes', 'entries'], {}],
      ['of a negative count of mistakes made', ['mistakes', 'made'], -1],
      [
        'of a mistake on an unknown letter',
        ['mistakes', 'entries', 0, 'item', 'pitch', 'letter'],
        'H',
      ],
      ['of a mistake counted 0 times', ['mistakes', 'entries', 0, 'count'], 0],
      ['of a mistake of an unknown topic', ['mistakes', 'entries', 0, 'topics'], ['harmony']],
      ['of a mistake without its order', ['mistakes', 'entries', 0, 'last'], undefined],
      ['of a queue asked a negative number of times', ['reviewQueue', 'asked'], -1],
      ['of a queue entries not a list', ['reviewQueue', 'entries'], null],
      [
        'of a queue item of an unknown duration',
        ['reviewQueue', 'entries', 0, 'item', 'duration', 'value'],
        'long',
      ],
      ['of a queue item due on no question', ['reviewQueue', 'entries', 0, 'dueOn'], 'soon'],
      ['of a queue item of a count not whole', ['reviewQueue', 'entries', 0, 'rightInRow'], 0.5],
      ['of a queue item wrong twice as a text', ['reviewQueue', 'entries', 0, 'wrongTwice'], 'yes'],
      ['without a question', ['question'], undefined],
      ['of a question in the bass clef', ['question', 'clef'], 'bass'],
      ['of eight sharps', ['question', 'keySignature'], { count: 8, accidental: 'sharp' }],
      [
        'of a key signature of double sharps',
        ['question', 'keySignature'],
        { count: 2, accidental: 'double-sharp' },
      ],
      ['of a key signature without its sign', ['question', 'keySignature'], { count: 2 }],
      [
        'of a time signature not offered',
        ['question', 'timeSignature'],
        { beats: 5, beatValue: 4 },
      ],
      ['of a question without elements', ['question', 'elements'], []],
      ['of a question of rests only', ['question', 'elements'], [{ duration: { value: 'whole' } }]],
      ['of an element not an object', ['question', 'elements', 1], 'F#4'],
      ['of a note altered three times', ['question', 'elements', 1, 'pitch', 'alteration'], 3],
      ['of a note of an octave not whole', ['question', 'elements', 1, 'pitch', 'octave'], 4.5],
      ['of a note with an unknown sign', ['question', 'elements', 2, 'accidental'], 'double-sharp'],
      ['of a note with two dots', ['question', 'elements', 2, 'duration', 'dots'], 2],
      [
        'of a rest of an unknown duration',
        ['question', 'elements', 0, 'duration'],
        { value: 'long' },
      ],
      ['of grades as a text', ['grades'], 'checked'],
      ['of a first grade of another question', ['grades', 'first'], FIRST_GRADE.slice(1)],
      ['of a second grade of another question', ['grades', 'second'], SECOND_GRADE.slice(1)],
      ['of a grade of a pitch as a text', ['grades', 'first', 0, 'pitch'], 'yes'],
      ['of a grade of a duration as a text', ['grades', 'first', 0, 'duration'], 'no'],
      ['without a first grade', ['grades', 'first'], undefined],
    ])('reads as none: %s', (_, path, value) => {
      expect(parseSavedSession(changed(path, value))).toBeNull()
    })

    it('reads a grade of a duration not asked', () => {
      const text = changed(['grades', 'first', 0, 'duration'], null)

      expect(parseSavedSession(text)?.grades?.first[0]).toEqual({ pitch: true, duration: null })
    })

    it('reads a question number of any size in a session on time or without a limit', () => {
      const onTime = changed(['number'], 120, { ...SAVED, length: { minutes: 10 } })
      const noLimit = changed(['number'], 120, { ...SAVED, length: 'unlimited' })

      expect(parseSavedSession(onTime)?.number).toBe(120)
      expect(parseSavedSession(noLimit)?.number).toBe(120)
    })
  })
})
