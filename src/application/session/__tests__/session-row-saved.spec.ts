import { describe, expect, it } from 'vitest'
import type { Clock } from '@/application/ports'
import { createSession } from '@/application/session'
import type { PassedNote, ProgressRecorder, Session, SessionState } from '@/application/session'
import { presetDifficulty, type Difficulty } from '@/domain/difficulty'
import type { Letter } from '@/domain/pitch'
import type { SavedSession } from '@/domain/progress'
import { COMMON_TIME, createQuestionOf, type Note, type Question } from '@/domain/question'
import type { Exercise } from '@/domain/session'

// Feature staff-progress-row, slice 4: the session saved keeps the notes passed in the row of the
// question on the screen, so that Continue brings them back with their marks (criterion 13).
//
// - Wherever the session is saved — on each check, on each move to a new question, on request as
//   the page is hidden — it is saved with `row: { passed }`, the notes of the row before the
//   question on the screen, each right or not by its first attempt, as the state of the question
//   holds them. Write notes and questions of several notes have no row and save none.
// - resume() goes on with the row saved: a question not checked opens with the notes passed before
//   it; a question checked passes into the row as by Next, unless it was the last of its row, and
//   the next question opens a new one. The row goes on from there, and the question opened is saved
//   with it.
// - A session saved before the row, without one, goes on with no notes passed left of the question
//   on the screen (edge case 4).
//
// The question source stands for the generator: each page asks about C4, D4, E4… in turn from its
// start, one quarter note each.

const LETTERS: readonly Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B']

// First steps asks one note and no duration.
const ONE_NOTE = presetDifficulty('first-steps')
const TWO_TO_FOUR: Difficulty = { ...ONE_NOTE, questionLength: 'two-to-four-notes' }

const noteOf = (turn: number): Note => ({
  pitch: { letter: LETTERS[turn % LETTERS.length] as Letter, octave: 4 },
  duration: { value: 'quarter' },
})

function questionSource() {
  let turn = 0
  const next = (): Question => {
    const note = noteOf(turn)
    turn += 1
    return createQuestionOf(COMMON_TIME, [note])
  }
  return () => next
}

// What the progress of the browser keeps of the sessions: the last one saved, and each save.
function browserProgress() {
  const saves: SavedSession[] = []
  const progress: ProgressRecorder = {
    recordAnswers() {},
    recordSession() {},
    saveSession(session) {
      saves.push(session)
    },
    discardSession() {},
  }
  return {
    progress,
    saves,
    // What Continue is given.
    unfinished(): SavedSession {
      const saved = saves[saves.length - 1]
      if (!saved) throw new Error('expected a session saved')
      return saved
    },
  }
}

type Browser = ReturnType<typeof browserProgress>

interface Modes {
  autoAdvance: boolean
  showAnswerAtOnce: boolean
  difficulty: Difficulty
  exercise: Exercise
}

function openPage(browser: Browser, initial: Partial<Modes> = {}) {
  const modes: Modes = {
    autoAdvance: false,
    showAnswerAtOnce: false,
    difficulty: ONE_NOTE,
    exercise: 'read',
    ...initial,
  }
  const clock: Clock = { now: () => 0 }
  return createSession(
    questionSource(),
    clock,
    {
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
    },
    undefined,
    browser.progress,
  )
}

type QuestionPhase = Extract<SessionState, { phase: 'question' }>

function question(session: Session): QuestionPhase {
  const { state } = session
  if (state.phase === 'question') return state
  throw new Error(`expected a question of Read notes, got ${state.phase}`)
}

function passedOf(session: Session): readonly PassedNote[] {
  const { row } = question(session)
  if (!row) throw new Error('expected a row')
  return row.passed
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

function playRight(session: Session, questions: number) {
  for (let count = 0; count < questions; count++) {
    answerRight(session)
    session.next()
  }
}

// Question 1 right, question 2 right on the second try, question 3 open.
function leftOnQuestionThree(browser: Browser) {
  const session = openPage(browser)
  session.start(20)
  answerRight(session)
  session.next()
  answerWrongThenRight(session)
  session.next()
  return session
}

const C4_RIGHT: PassedNote = { note: noteOf(0), right: true }
const D4_WRONG: PassedNote = { note: noteOf(1), right: false }

describe('the row saved with the session (criterion 13)', () => {
  it('is saved with the notes passed once the next question opens', () => {
    const browser = browserProgress()

    leftOnQuestionThree(browser)

    expect(browser.unfinished()).toMatchObject({ number: 3, grades: null })
    expect(browser.unfinished().row).toEqual({ passed: [C4_RIGHT, D4_WRONG] })
  })

  it('is saved on a check without the question checked among the passed notes', () => {
    const browser = browserProgress()
    const session = leftOnQuestionThree(browser)

    answerRight(session)

    expect(browser.unfinished().grades).not.toBeNull()
    expect(browser.unfinished().row).toEqual({ passed: [C4_RIGHT, D4_WRONG] })
  })

  it('is saved on request as the page is hidden', () => {
    const browser = browserProgress()
    const session = leftOnQuestionThree(browser)
    browser.saves.length = 0

    session.saveProgress()

    expect(browser.unfinished().row).toEqual({ passed: [C4_RIGHT, D4_WRONG] })
  })

  it('is saved as the state of the question holds it', () => {
    const browser = browserProgress()
    const session = leftOnQuestionThree(browser)

    expect(browser.unfinished().row?.passed).toEqual(passedOf(session))
  })

  it('is saved with no notes passed on the first question of a new row', () => {
    const browser = browserProgress()
    const session = openPage(browser)
    session.start(20)

    playRight(session, 10)

    expect(browser.unfinished().number).toBe(11)
    expect(browser.unfinished().row).toEqual({ passed: [] })
  })

  it('is not saved in Write notes', () => {
    const browser = browserProgress()
    const session = openPage(browser, { exercise: 'write' })
    session.start(20)

    session.noteDrawn()
    session.place({ letter: 'E', octave: 4 })
    session.check()

    expect(browser.unfinished().exercise).toBe('write')
    expect(browser.unfinished().row).toBeUndefined()
  })

  it('is not saved for questions of several notes', () => {
    const browser = browserProgress()
    const session = openPage(browser, { difficulty: TWO_TO_FOUR })
    session.start(20)

    answerRight(session)

    expect(browser.unfinished().row).toBeUndefined()
  })
})

describe('Continue with the row (criterion 13)', () => {
  it('opens a question not checked with the notes passed before it', () => {
    const browser = browserProgress()
    leftOnQuestionThree(browser)
    const session = openPage(browserProgress())

    session.resume(browser.unfinished())

    expect(question(session).number).toBe(3)
    expect(passedOf(session)).toEqual([C4_RIGHT, D4_WRONG])
  })

  it('passes a question checked into the row, right or not by its first attempt', () => {
    const browser = browserProgress()
    const before = leftOnQuestionThree(browser)
    answerWrongThenRight(before)
    const session = openPage(browserProgress())

    session.resume(browser.unfinished())

    expect(question(session).number).toBe(4)
    expect(passedOf(session)).toEqual([C4_RIGHT, D4_WRONG, { note: noteOf(2), right: false }])
  })

  it('opens a new row after the last question of a row checked', () => {
    const browser = browserProgress()
    const before = openPage(browser)
    before.start(20)
    playRight(before, 9)
    answerRight(before)
    const session = openPage(browserProgress())

    session.resume(browser.unfinished())

    expect(question(session).number).toBe(11)
    expect(passedOf(session)).toEqual([])
  })

  it('goes on with the row after it', () => {
    const browser = browserProgress()
    leftOnQuestionThree(browser)
    const session = openPage(browserProgress())
    session.resume(browser.unfinished())
    const current = soleNote(session)

    answerRight(session)
    session.next()

    expect(question(session).number).toBe(4)
    expect(passedOf(session)).toEqual([C4_RIGHT, D4_WRONG, { note: current, right: true }])
  })

  it('saves the question it opens with its row', () => {
    const browser = browserProgress()
    const before = leftOnQuestionThree(browser)
    answerRight(before)
    const later = browserProgress()
    const session = openPage(later)

    session.resume(browser.unfinished())

    expect(later.unfinished()).toMatchObject({ number: 4, grades: null })
    expect(later.unfinished().row).toEqual({ passed: passedOf(session) })
    expect(passedOf(session)).toHaveLength(3)
  })

  describe('of a session saved before the row (edge case 4)', () => {
    function savedWithoutRow(browser: Browser): SavedSession {
      leftOnQuestionThree(browser)
      const { row: _row, ...saved } = browser.unfinished()
      return saved
    }

    it('opens the question with no notes passed left of it', () => {
      const session = openPage(browserProgress())

      session.resume(savedWithoutRow(browserProgress()))

      expect(question(session).number).toBe(3)
      expect(passedOf(session)).toEqual([])
    })

    it('goes on with the row from the question on the screen', () => {
      const session = openPage(browserProgress())
      session.resume(savedWithoutRow(browserProgress()))
      const current = soleNote(session)

      answerRight(session)
      session.next()

      expect(passedOf(session)).toEqual([{ note: current, right: true }])
    })
  })
})
