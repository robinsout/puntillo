import { describe, expect, it } from 'vitest'
import type { Clock } from '@/application/ports'
import { createSession } from '@/application/session'
import type { PassedNote, Session, SessionState } from '@/application/session'
import { presetDifficulty, type Difficulty } from '@/domain/difficulty'
import type { Letter } from '@/domain/pitch'
import { COMMON_TIME, createQuestionOf, type Note, type Question } from '@/domain/question'
import type { Exercise, SessionLength } from '@/domain/session'

// Feature staff-progress-row, slice 2: in Read notes with questions of one note the state of a
// question holds its row: `row: { passed, final }`. A row is ten questions of the session —
// questions 1–10, 11–20 and so on (criterion 1). `passed` are the notes of the questions of the row
// before the current one, each with whether it was right on the first attempt, `right` (criterion 8
// in slice 3): none on the first question of a row, nine on the last. `final` tells the last row of
// a session of 10, 20 or 50 questions, which ends with the final double bar line; a session on time
// or without a limit has no last row (criterion 3). The current question is never among the passed
// ones, checked or not. Questions of several notes and Write notes have no row: null (edge case 1).
// In the quick mode a question answered right passes at once (edge case 3).
//
// The question source stands for the generator: it asks about C4, D4, E4… in turn, one quarter
// note each, so that each question of a row is told by its note.

const LETTERS: readonly Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B']

// First steps asks one note and no duration.
const ONE_NOTE = presetDifficulty('first-steps')
const ONE_BAR = presetDifficulty('confident-reading')
const TWO_TO_FOUR: Difficulty = { ...ONE_NOTE, questionLength: 'two-to-four-notes' }

const noteOf = (turn: number): Note => ({
  pitch: { letter: LETTERS[turn % LETTERS.length] as Letter, octave: 4 },
  duration: { value: 'quarter' },
})

// The notes the source asks about, in turn: what the questions 1, 2, 3… ask about.
const asked = (from: number, to: number): Note[] =>
  Array.from({ length: to - from + 1 }, (_, index) => noteOf(from - 1 + index))

function questionSource() {
  let turn = 0
  const next = (): Question => {
    const note = noteOf(turn)
    turn += 1
    return createQuestionOf(COMMON_TIME, [note])
  }
  return () => next
}

interface Modes {
  autoAdvance: boolean
  showAnswerAtOnce: boolean
  difficulty: Difficulty
  exercise: Exercise
}

function openPage(initial: Partial<Modes> = {}) {
  const modes: Modes = {
    autoAdvance: false,
    showAnswerAtOnce: false,
    difficulty: ONE_NOTE,
    exercise: 'read',
    ...initial,
  }
  const clock: Clock = { now: () => 0 }
  return createSession(questionSource(), clock, {
    get difficulty() {
      return modes.difficulty
    },
    get exercise() {
      return modes.exercise
    },
    get autoAdvance() {
      return modes.autoAdvance
    },
    get showAnswerAtOnce() {
      return modes.showAnswerAtOnce
    },
    chooseAutoAdvance(on: boolean) {
      modes.autoAdvance = on
    },
    chooseShowAnswerAtOnce(on: boolean) {
      modes.showAnswerAtOnce = on
    },
  })
}

type QuestionPhase = Extract<SessionState, { phase: 'question' }>

function question(session: Session): QuestionPhase {
  const { state } = session
  if (state.phase === 'question') return state
  throw new Error(`expected a question of Read notes, got ${state.phase}`)
}

function rowOf(session: Session) {
  const { row } = question(session)
  if (!row) throw new Error('expected a row')
  return row
}

const soleNote = (session: Session) => question(session).trainer.question.notes[0] as Note
const rightLetter = (session: Session): Letter => soleNote(session).pitch.letter
const wrongLetter = (session: Session): Letter => (rightLetter(session) === 'B' ? 'A' : 'B')

function answerRight(session: Session) {
  session.noteDrawn()
  session.select(rightLetter(session))
  session.check()
}

// Wrong on the first attempt, right on the second.
function answerWrongThenRight(session: Session) {
  session.noteDrawn()
  session.select(wrongLetter(session))
  session.check()
  session.select(rightLetter(session))
  session.check()
}

// Wrong on both attempts, with two different letters: the one rejected cannot be chosen again.
function answerWrongTwice(session: Session) {
  session.noteDrawn()
  session.select(wrongLetter(session))
  session.check()
  session.select(rightLetter(session) === 'G' ? 'F' : 'G')
  session.check()
}

type Answer = (session: Session) => void

// Answers the questions from the current one up to `last`, by the plan or else right, and moves on
// after each: the question after `last` is open.
function playThrough(session: Session, last: number, plan: Record<number, Answer> = {}) {
  while (question(session).number <= last) {
    const { number } = question(session)
    ;(plan[number] ?? answerRight)(session)
    if (question(session).trainer.outcome === null) throw new Error(`question ${number} not over`)
    session.next()
  }
}

const rightNotes = (notes: readonly Note[]): PassedNote[] =>
  notes.map((note) => ({ note, right: true }))

describe('the row of a question of one note in Read notes', () => {
  it('has no passed notes on the first question', () => {
    const session = openPage()
    session.start(10)

    expect(rowOf(session).passed).toEqual([])
  })

  it('keeps the current question out of the passed notes once it is checked', () => {
    const session = openPage()
    session.start(10)

    answerRight(session)

    expect(question(session).trainer.outcome).toBe('correct')
    expect(rowOf(session).passed).toEqual([])
  })

  it('passes the note of a question once the next one opens', () => {
    const session = openPage()
    session.start(10)

    playThrough(session, 1)

    expect(question(session).number).toBe(2)
    expect(rowOf(session).passed).toEqual(rightNotes(asked(1, 1)))
  })

  it('holds the notes of the questions before the current one, in their order', () => {
    const session = openPage()
    session.start(10)

    playThrough(session, 3)

    expect(question(session).number).toBe(4)
    expect(soleNote(session)).toEqual(noteOf(3))
    expect(rowOf(session).passed).toEqual(rightNotes(asked(1, 3)))
  })

  it('holds nine passed notes on the tenth question', () => {
    const session = openPage()
    session.start(20)

    playThrough(session, 9)

    expect(question(session).number).toBe(10)
    expect(rowOf(session).passed).toEqual(rightNotes(asked(1, 9)))
  })

  it('starts a new row on the eleventh question, with no passed notes (criterion 4)', () => {
    const session = openPage()
    session.start(20)

    playThrough(session, 10)

    expect(question(session).number).toBe(11)
    expect(rowOf(session).passed).toEqual([])
  })

  it('holds the notes of its own row only on the questions after', () => {
    const session = openPage()
    session.start(50)

    playThrough(session, 23)

    expect(question(session).number).toBe(24)
    expect(rowOf(session).passed).toEqual(rightNotes(asked(21, 23)))
  })

  it('tells each note right or not by the first attempt', () => {
    const session = openPage()
    session.start(10)

    playThrough(session, 3, { 2: answerWrongThenRight, 3: answerWrongTwice })

    expect(rowOf(session).passed.map(({ right }) => right)).toEqual([true, false, false])
  })

  it('tells a note wrong when the right answer is shown at once', () => {
    const session = openPage({ showAnswerAtOnce: true })
    session.start(10)

    playThrough(session, 1, {
      1: (each) => {
        each.noteDrawn()
        each.select(wrongLetter(each))
        each.check()
      },
    })

    expect(question(session).trainer.outcome).toBeNull()
    expect(rowOf(session).passed).toEqual([{ note: noteOf(0), right: false }])
  })

  it('passes a note answered right at once in the quick mode (edge case 3)', () => {
    const session = openPage({ autoAdvance: true })
    session.start(10)

    session.noteDrawn()
    session.answer(rightLetter(session))

    expect(question(session).number).toBe(2)
    expect(rowOf(session).passed).toEqual(rightNotes(asked(1, 1)))
  })

  it('passes a note right on the second try in the quick mode as wrong', () => {
    const session = openPage({ autoAdvance: true })
    session.start(10)

    session.noteDrawn()
    session.answer(wrongLetter(session))
    session.answer(rightLetter(session))

    expect(question(session).number).toBe(2)
    expect(rowOf(session).passed).toEqual([{ note: noteOf(0), right: false }])
  })

  it('passes the note of a question left by turning the quick mode on', () => {
    const session = openPage()
    session.start(10)
    answerRight(session)

    session.setAutoAdvance(true)

    expect(question(session).number).toBe(2)
    expect(rowOf(session).passed).toEqual(rightNotes(asked(1, 1)))
  })

  it('starts anew with a new session', () => {
    const session = openPage()
    session.start(20)
    playThrough(session, 4)
    session.finish()
    session.newSession()

    session.start(20)

    expect(rowOf(session).passed).toEqual([])
  })

  it('starts anew with Practice only these', () => {
    const session = openPage()
    session.start(10)
    playThrough(session, 9, { 2: answerWrongThenRight })
    answerRight(session)
    session.next()
    expect(session.state.phase).toBe('results')

    session.practiceMostMistakes()

    expect(rowOf(session).passed).toEqual([])
  })
})

describe('the last row of a session (criterion 3)', () => {
  it('is the only row of a session of 10, from its first question to its last', () => {
    const session = openPage()
    session.start(10)
    expect(rowOf(session).final).toBe(true)

    playThrough(session, 9)

    expect(question(session).number).toBe(10)
    expect(rowOf(session).final).toBe(true)
  })

  it('is the second row of a session of 20, not the first', () => {
    const session = openPage()
    session.start(20)
    expect(rowOf(session).final).toBe(false)

    playThrough(session, 9)
    expect(rowOf(session).final).toBe(false)

    playThrough(session, 10)
    expect(question(session).number).toBe(11)
    expect(rowOf(session).final).toBe(true)
  })

  it('is the fifth row of a session of 50', () => {
    const session = openPage()
    session.start(50)

    playThrough(session, 39)
    expect(question(session).number).toBe(40)
    expect(rowOf(session).final).toBe(false)

    playThrough(session, 40)
    expect(question(session).number).toBe(41)
    expect(rowOf(session).final).toBe(true)
  })

  it.each<[string, SessionLength]>([
    ['on time', { minutes: 10 }],
    ['without a limit', 'unlimited'],
  ])('is none in a session %s, which goes by rows of ten all the same', (_, length) => {
    const session = openPage()
    session.start(length)
    expect(rowOf(session).final).toBe(false)

    playThrough(session, 13)

    expect(question(session).number).toBe(14)
    expect(rowOf(session).final).toBe(false)
    expect(rowOf(session).passed).toEqual(rightNotes(asked(11, 13)))
  })
})

// Edge case 1.
describe('no row', () => {
  it.each<[string, Difficulty]>([
    ['of one bar', ONE_BAR],
    ['of two to four notes', TWO_TO_FOUR],
  ])('for a question %s', (_, difficulty) => {
    const session = openPage({ difficulty })
    session.start(10)

    expect(question(session).row).toBeNull()
  })

  it('in Write notes', () => {
    const session = openPage({ exercise: 'write' })
    session.start(10)

    const { state } = session
    expect(state.phase).toBe('writing')
    expect((state as { row?: unknown }).row ?? null).toBeNull()
  })
})
