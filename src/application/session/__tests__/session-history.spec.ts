import { describe, expect, it } from 'vitest'
import type { Clock } from '@/application/ports'
import { createSession } from '@/application/session'
import type { ProgressRecorder, Session, SessionState } from '@/application/session'
import { presetDifficulty, type Difficulty } from '@/domain/difficulty'
import type { Letter, Pitch } from '@/domain/pitch'
import type { SessionSummary } from '@/domain/progress'
import { createQuestion, type Duration, type Question } from '@/domain/question'
import type { Exercise, SessionLength } from '@/domain/session'

// Feature progress-and-storage, slice 2: a session that reaches its results is told for the history
// of sessions (criteria 2, 3). It is told once, as the results open: by the number of questions,
// by the time, or by Finish with at least one question checked; Finish with none checked tells
// nothing. Practice only these is a session of its own, told when its results open. The summary
// holds the exercise, the length, the questions checked and the accuracy as a whole percent, as
// the results show it. The time it finished is the progress's to take.
//
// The questions go C4, D4, E4… as whole notes to read, G4, F4… to write within First steps.

const CONFIDENT_READING = presetDifficulty('confident-reading')
const FIRST_STEPS = presetDifficulty('first-steps')

const MINUTE = 60_000

function questionSource(letters: readonly Letter[]) {
  let served = 0
  const next = (): Question => {
    const letter = letters[served % letters.length] as Letter
    served += 1
    return createQuestion({ pitch: { letter, octave: 4 }, duration: { value: 'whole' } })
  }
  return () => next
}

interface Modes {
  autoAdvance: boolean
  showAnswerAtOnce: boolean
  difficulty: Difficulty
  exercise: Exercise
}

function setup(initial: Partial<Modes> = {}) {
  const modes: Modes = {
    autoAdvance: false,
    showAnswerAtOnce: false,
    difficulty: CONFIDENT_READING,
    exercise: 'read',
    ...initial,
  }
  let now = 0
  const clock: Clock = { now: () => now }
  const sessions: SessionSummary[] = []
  const progress: ProgressRecorder = {
    recordAnswers() {},
    recordSession(summary) {
      sessions.push(summary)
    },
  }
  const session = createSession(
    questionSource(modes.exercise === 'write' ? ['G', 'F'] : ['C', 'D', 'E', 'F', 'G', 'A', 'B']),
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
    progress,
  )
  return {
    session,
    sessions,
    elapse(ms: number) {
      now += ms
    },
  }
}

type ResultsPhase = Extract<SessionState, { phase: 'results' }>

function inResults(session: Session): ResultsPhase {
  const { state } = session
  if (state.phase !== 'results') throw new Error(`expected results phase, got ${state.phase}`)
  return state
}

function soleNote(session: Session) {
  const { state } = session
  const question =
    state.phase === 'question'
      ? state.trainer.question
      : state.phase === 'writing'
        ? state.writing.question
        : null
  const [note, ...others] = question?.notes ?? []
  if (!note || others.length > 0) throw new Error('expected a question of one note')
  return note
}

const rightLetter = (session: Session): Letter => soleNote(session).pitch.letter
const wrongLetter = (session: Session): Letter => (rightLetter(session) === 'C' ? 'E' : 'C')
const anotherWrongLetter = (session: Session): Letter => (rightLetter(session) === 'B' ? 'A' : 'B')
const rightDuration = (session: Session): Duration => soleNote(session).duration

// Two points of two.
function answerRight(session: Session) {
  session.noteDrawn()
  session.select(rightLetter(session))
  session.selectDuration(rightDuration(session))
  session.check()
}

// Both attempts wrong on the name, the duration right: the question is over, one point of two.
function answerWrong(session: Session) {
  session.noteDrawn()
  session.select(wrongLetter(session))
  session.selectDuration(rightDuration(session))
  session.check()
  session.select(anotherWrongLetter(session))
  session.check()
}

function answerQuickRight(session: Session) {
  session.noteDrawn()
  session.selectDuration(rightDuration(session))
  session.answer(rightLetter(session))
}

function writeRight(session: Session) {
  session.noteDrawn()
  const { pitch } = soleNote(session)
  const written: Pitch = { letter: pitch.letter, octave: pitch.octave }
  session.place(written)
  session.check()
}

// Each question answered right and left by Next, the last one too: the results open after it.
function playThrough(session: Session, questions: number) {
  for (let number = 1; number <= questions; number++) {
    answerRight(session)
    session.next()
  }
}

const summary = (
  length: SessionLength,
  questions: number,
  accuracy: number,
  exercise: Exercise = 'read',
): SessionSummary => ({ exercise, length, questions, accuracy })

describe('the session told for the history (criteria 2, 3)', () => {
  describe('by the number of questions', () => {
    it.each([10, 20, 50] as const)('is told once its %i questions are done', (length) => {
      const { session, sessions } = setup()
      session.start(length)

      playThrough(session, length)

      expect(inResults(session).score.checked).toBe(length)
      expect(sessions).toEqual([summary(length, length, 100)])
    })

    it('is not told before the results open', () => {
      const { session, sessions } = setup()
      session.start(10)
      playThrough(session, 9)

      answerRight(session)

      expect(sessions).toEqual([])
    })

    it('holds the accuracy as a whole percent, as the results show it', () => {
      const { session, sessions } = setup()
      session.start(10)
      answerWrong(session)
      session.next()
      answerWrong(session)
      session.next()

      playThrough(session, 8)

      // 18 points of 20.
      expect(sessions).toEqual([summary(10, 10, 90)])
    })

    it('opens the results in the quick mode by a right answer, and is told', () => {
      const { session, sessions } = setup({ autoAdvance: true })
      session.start(10)

      for (let number = 1; number <= 10; number++) answerQuickRight(session)

      expect(inResults(session).score.checked).toBe(10)
      expect(sessions).toEqual([summary(10, 10, 100)])
    })
  })

  describe('by the time', () => {
    it('is told once the time is up and the last question is left', () => {
      const { session, sessions, elapse } = setup()
      session.start({ minutes: 3 })
      answerRight(session)
      session.next()
      elapse(3 * MINUTE)
      answerWrong(session)

      expect(sessions).toEqual([])
      session.next()

      // 3 points of 4: 75%.
      expect(sessions).toEqual([summary({ minutes: 3 }, 2, 75)])
    })

    it.each([5, 10] as const)('holds the length of %i minutes', (minutes) => {
      const { session, sessions, elapse } = setup()
      session.start({ minutes })
      elapse(minutes * MINUTE)

      answerRight(session)
      session.next()

      expect(sessions).toEqual([summary({ minutes }, 1, 100)])
    })

    it('is not told while the time is up but the question is not left', () => {
      const { session, sessions, elapse } = setup()
      session.start({ minutes: 3 })
      answerRight(session)

      elapse(4 * MINUTE)

      expect(session.state.phase).toBe('question')
      expect(sessions).toEqual([])
    })
  })

  describe('by Finish', () => {
    it('is told with the questions checked', () => {
      const { session, sessions } = setup()
      session.start('unlimited')
      answerRight(session)
      session.next()
      answerRight(session)
      session.next()
      answerWrong(session)

      session.finish()

      // 5 points of 6: 83%.
      expect(sessions).toEqual([summary('unlimited', 3, 83)])
    })

    it('leaves out the question shown but not checked', () => {
      const { session, sessions } = setup()
      session.start(20)
      answerRight(session)
      session.next()
      session.select(rightLetter(session))

      session.finish()

      expect(sessions).toEqual([summary(20, 1, 100)])
    })

    it('is told for a session on time before the time is up', () => {
      const { session, sessions } = setup()
      session.start({ minutes: 5 })
      answerWrong(session)

      session.finish()

      expect(sessions).toEqual([summary({ minutes: 5 }, 1, 50)])
    })

    it('tells nothing without a question checked', () => {
      const { session, sessions } = setup()
      session.start('unlimited')
      session.select('C')

      session.finish()

      expect(session.state.phase).toBe('choosing')
      expect(sessions).toEqual([])
    })
  })

  describe('once', () => {
    it('is told once however often the results are read', () => {
      const { session, sessions } = setup()
      session.start('unlimited')
      answerRight(session)
      session.finish()

      for (let reading = 0; reading < 3; reading++) inResults(session)

      expect(sessions).toHaveLength(1)
    })

    it('is not told again by Finish or New session from the results', () => {
      const { session, sessions } = setup()
      session.start('unlimited')
      answerRight(session)
      session.finish()

      session.finish()
      session.newSession()

      expect(sessions).toHaveLength(1)
    })

    it('tells each session of the page in turn', () => {
      const { session, sessions } = setup()
      session.start('unlimited')
      answerRight(session)
      session.finish()
      session.newSession()
      session.start(10)

      playThrough(session, 10)

      expect(sessions).toEqual([summary('unlimited', 1, 100), summary(10, 10, 100)])
    })

    it('does not tell a session left by Finish without a check', () => {
      const { session, sessions } = setup()
      session.start('unlimited')
      session.finish()
      session.start(10)

      playThrough(session, 10)

      expect(sessions).toEqual([summary(10, 10, 100)])
    })
  })

  describe('Practice only these', () => {
    it('is a session of its own, told when its results open', () => {
      const { session, sessions } = setup()
      session.start(10)
      answerWrong(session)
      session.next()
      playThrough(session, 9)

      session.practiceMostMistakes()
      expect(sessions).toHaveLength(1)
      playThrough(session, 10)

      // 19 points of 20 in the first, then all right.
      expect(sessions).toEqual([summary(10, 10, 95), summary(10, 10, 100)])
    })

    it('is told by Finish with the questions checked in it alone', () => {
      const { session, sessions } = setup()
      session.start('unlimited')
      answerWrong(session)
      session.finish()
      session.practiceMostMistakes()
      answerRight(session)
      session.next()
      answerRight(session)

      session.finish()

      expect(sessions).toEqual([summary('unlimited', 1, 50), summary('unlimited', 2, 100)])
    })
  })

  describe('in Write notes', () => {
    it('holds the exercise', () => {
      const { session, sessions } = setup({ exercise: 'write', difficulty: FIRST_STEPS })
      session.start(10)

      for (let number = 1; number <= 10; number++) {
        writeRight(session)
        session.next()
      }

      expect(sessions).toEqual([summary(10, 10, 100, 'write')])
    })

    it('is told by Finish', () => {
      const { session, sessions } = setup({ exercise: 'write', difficulty: FIRST_STEPS })
      session.start('unlimited')
      writeRight(session)

      session.finish()

      expect(sessions).toEqual([summary('unlimited', 1, 100, 'write')])
    })
  })
})
