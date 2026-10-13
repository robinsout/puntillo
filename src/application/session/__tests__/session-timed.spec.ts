import { describe, expect, it } from 'vitest'
import type { Clock } from '@/application/ports'
import { createSession } from '@/application/session'
import type { Session, SessionState } from '@/application/session'
import { presetDifficulty, type Difficulty } from '@/domain/difficulty'
import { LETTERS } from '@/domain/pitch'
import type { Letter, Pitch } from '@/domain/pitch'
import type { Duration, Question } from '@/domain/question'
import { createQuestion } from '@/domain/question'
import { averageTimeMs } from '@/domain/session'
import type { Exercise, TimeLimit } from '@/domain/session'

// Feature session-summary, slice 1: a session on time. It shows the time passed since its start
// instead of the question number (criterion 2). Once the time is up, the question begun can still
// be answered; after its check it is the last one, so Next leads to the results, and in the quick
// mode a right answer opens them at once (criterion 3). Finish works as in the other lengths
// (criterion 4), and the results hold the same score (criterion 5). The time is read from the
// clock, so it goes on whatever the page does meanwhile (edge case 4).

const CONFIDENT_READING = presetDifficulty('confident-reading')
const FIRST_STEPS = presetDifficulty('first-steps')

const SECOND = 1000
const MINUTE = 60 * SECOND
const THREE_MINUTES: TimeLimit = { minutes: 3 }

// The questions go C4, D4… as whole notes to read; to write, G4, F4… within First steps.
function questionSource(letters: readonly Letter[]) {
  const served: Question[] = []
  const next = () => {
    const letter = letters[served.length % letters.length] ?? 'G'
    const question = createQuestion({ pitch: { letter, octave: 4 }, duration: { value: 'whole' } })
    served.push(question)
    return question
  }
  return { questionsFor: () => next }
}

function fakeClock() {
  let now = 0
  const clock: Clock = { now: () => now }
  return {
    clock,
    elapse(ms: number) {
      now += ms
    },
  }
}

interface Modes {
  autoAdvance: boolean
  showAnswerAtOnce: boolean
  difficulty: Difficulty
  exercise: Exercise
}

// Stands for the preferences. Unless told otherwise: Read notes in Confident reading, which asks
// for the duration.
function rememberedModes(initial: Partial<Modes> = {}) {
  const modes: Modes = {
    autoAdvance: false,
    showAnswerAtOnce: false,
    difficulty: CONFIDENT_READING,
    exercise: 'read',
    ...initial,
  }
  return {
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
  }
}

function setup(remembered: Partial<Modes> = {}) {
  const source = questionSource(remembered.exercise === 'write' ? ['G', 'F'] : LETTERS)
  const time = fakeClock()
  const session = createSession(source.questionsFor, time.clock, rememberedModes(remembered))
  return { session, clock: time }
}

type QuestionPhase = Extract<SessionState, { phase: 'question' }>
type WritingPhase = Extract<SessionState, { phase: 'writing' }>
type ResultsPhase = Extract<SessionState, { phase: 'results' }>

function inQuestion(session: Session): QuestionPhase {
  const { state } = session
  if (state.phase !== 'question') throw new Error(`expected question phase, got ${state.phase}`)
  return state
}

function inWriting(session: Session): WritingPhase {
  const { state } = session
  if (state.phase !== 'writing') throw new Error(`expected writing phase, got ${state.phase}`)
  return state
}

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

// Both presses wrong: the quick mode stops on the review until next.
function answerQuickWrong(session: Session) {
  session.noteDrawn()
  session.selectDuration(rightDuration(session))
  session.answer(wrongLetter(session))
  session.answer(anotherWrongLetter(session))
}

describe('a session on time', () => {
  describe('starting', () => {
    it.each([3, 5, 10] as const)('opens the first question for %i minutes', (minutes) => {
      const { session } = setup()

      session.start({ minutes })

      const state = inQuestion(session)
      expect(state.length).toEqual({ minutes })
      expect(state.number).toBe(1)
      expect(state.isLast).toBe(false)
    })

    it('has no time passed yet', () => {
      const { session } = setup()

      session.start(THREE_MINUTES)

      expect(inQuestion(session).elapsedMs).toBe(0)
    })
  })

  describe('time passed', () => {
    it('is read from the clock, from the start of the session', () => {
      const { session, clock } = setup()
      clock.elapse(5 * MINUTE)
      session.start(THREE_MINUTES)

      clock.elapse(84 * SECOND)

      expect(inQuestion(session).elapsedMs).toBe(84 * SECOND)
    })

    it('runs through the questions, not anew for each one', () => {
      const { session, clock } = setup()
      session.start(THREE_MINUTES)

      clock.elapse(10 * SECOND)
      answerRight(session)
      clock.elapse(5 * SECOND)
      session.next()
      clock.elapse(20 * SECOND)

      const state = inQuestion(session)
      expect(state.number).toBe(2)
      expect(state.elapsedMs).toBe(35 * SECOND)
    })

    // Edge case 4: nothing has to happen on the page for the time to pass.
    it('counts a long stretch without any action at once', () => {
      const { session, clock } = setup()
      session.start(THREE_MINUTES)

      clock.elapse(2 * MINUTE + 7 * SECOND)

      expect(inQuestion(session).elapsedMs).toBe(2 * MINUTE + 7 * SECOND)
    })

    it('starts anew with a new session', () => {
      const { session, clock } = setup()
      session.start(THREE_MINUTES)
      clock.elapse(MINUTE)
      session.finish()
      session.newSession()

      session.start({ minutes: 5 })
      clock.elapse(3 * SECOND)

      expect(inQuestion(session).elapsedMs).toBe(3 * SECOND)
    })
  })

  describe('before the time is up', () => {
    it('goes from question to question without a last one', () => {
      const { session, clock } = setup()
      session.start(THREE_MINUTES)

      for (let number = 1; number <= 60; number += 1) {
        const state = inQuestion(session)
        expect(state.number).toBe(number)
        expect(state.isLast).toBe(false)
        answerRight(session)
        expect(inQuestion(session).isLast).toBe(false)
        clock.elapse(SECOND)
        session.next()
      }

      expect(inQuestion(session).number).toBe(61)
    })

    it('has no last question a moment before the time is up', () => {
      const { session, clock } = setup()
      session.start(THREE_MINUTES)

      clock.elapse(3 * MINUTE - 1)
      answerRight(session)

      expect(inQuestion(session).isLast).toBe(false)
      session.next()
      expect(inQuestion(session).number).toBe(2)
    })
  })

  describe('once the time is up', () => {
    it('keeps the question begun, so that it can be answered', () => {
      const { session, clock } = setup()
      session.start(THREE_MINUTES)
      answerRight(session)
      session.next()

      clock.elapse(3 * MINUTE)

      const state = inQuestion(session)
      expect(state.number).toBe(2)
      expect(state.trainer.outcome).toBeNull()
      expect(state.trainer.selected).toBeNull()
    })

    // Decision of 2026-10-13: edge case 3 is Finish alone, not the time running out.
    it('keeps the first question, not yet checked, and leads to the results after its check', () => {
      const { session, clock } = setup()
      session.start(THREE_MINUTES)

      clock.elapse(3 * MINUTE)
      expect(inQuestion(session).number).toBe(1)
      expect(inQuestion(session).isLast).toBe(true)
      answerRight(session)
      session.next()

      expect(inResults(session).score).toMatchObject({ checked: 1, points: 2, maxPoints: 2 })
    })

    it('makes the question begun the last one', () => {
      const { session, clock } = setup()
      session.start(THREE_MINUTES)
      answerRight(session)
      session.next()

      clock.elapse(3 * MINUTE)

      expect(inQuestion(session).isLast).toBe(true)
    })

    it('leads to the results on next after the check of the question begun', () => {
      const { session, clock } = setup()
      session.start(THREE_MINUTES)
      answerRight(session)
      session.next()
      clock.elapse(3 * MINUTE)

      answerRight(session)
      expect(inQuestion(session).isLast).toBe(true)
      session.next()

      expect(inResults(session).score).toMatchObject({ checked: 2, points: 4, maxPoints: 4 })
    })

    it('does not lead to the results on next before the check', () => {
      const { session, clock } = setup()
      session.start(THREE_MINUTES)
      answerRight(session)
      session.next()
      clock.elapse(3 * MINUTE)

      session.next()

      expect(inQuestion(session).number).toBe(2)
    })

    it('lets the second attempt of the question begun be made', () => {
      const { session, clock } = setup()
      session.start(THREE_MINUTES)
      session.noteDrawn()
      session.select(wrongLetter(session))
      session.selectDuration(rightDuration(session))
      session.check()

      clock.elapse(3 * MINUTE)
      session.select(rightLetter(session))
      session.check()

      expect(inQuestion(session).trainer.outcome).toBe('correct-second-try')
      session.next()
      expect(inResults(session).score).toMatchObject({ checked: 1, points: 1, maxPoints: 2 })
    })

    // Criterion 3: the time can run out while the review of a checked question is open.
    it('makes the question under review the last one, so next leads to the results', () => {
      const { session, clock } = setup()
      session.start(THREE_MINUTES)
      clock.elapse(MINUTE)
      answerWrong(session)
      expect(inQuestion(session).isLast).toBe(false)

      clock.elapse(2 * MINUTE)

      expect(inQuestion(session).isLast).toBe(true)
      session.next()
      expect(inResults(session).score).toMatchObject({ checked: 1, points: 1, maxPoints: 2 })
    })

    it('opens the results at once after a right quick answer to the question begun', () => {
      const { session, clock } = setup({ autoAdvance: true })
      session.start(THREE_MINUTES)
      answerQuickRight(session)
      clock.elapse(3 * MINUTE)

      answerQuickRight(session)

      expect(inResults(session).score).toMatchObject({ checked: 2, points: 4, maxPoints: 4 })
    })

    it('stops the quick mode on the review of the question begun, then next leads to the results', () => {
      const { session, clock } = setup({ autoAdvance: true })
      session.start(THREE_MINUTES)
      clock.elapse(3 * MINUTE)

      answerQuickWrong(session)

      const state = inQuestion(session)
      expect(state.trainer.outcome).toBe('incorrect')
      expect(state.isLast).toBe(true)
      session.next()
      expect(inResults(session).score).toMatchObject({ checked: 1, points: 1, maxPoints: 2 })
    })

    it('opens the results when the quick mode is turned on over the result of the question begun', () => {
      const { session, clock } = setup()
      session.start(THREE_MINUTES)
      answerRight(session)
      clock.elapse(3 * MINUTE)

      session.setAutoAdvance(true)

      expect(inResults(session).score).toMatchObject({ checked: 1 })
    })
  })

  describe('in Write notes', () => {
    const writeRight = (session: Session) => {
      session.noteDrawn()
      const { pitch } = soleNote(session)
      const written: Pitch = { letter: pitch.letter, octave: pitch.octave }
      session.place(written)
      session.check()
    }

    it('shows the time passed on the question to write', () => {
      const { session, clock } = setup({ exercise: 'write', difficulty: FIRST_STEPS })
      session.start(THREE_MINUTES)

      clock.elapse(84 * SECOND)

      const state = inWriting(session)
      expect(state.length).toEqual(THREE_MINUTES)
      expect(state.elapsedMs).toBe(84 * SECOND)
      expect(state.isLast).toBe(false)
    })

    it('makes the question begun the last one once the time is up, and next leads to the results', () => {
      const { session, clock } = setup({ exercise: 'write', difficulty: FIRST_STEPS })
      session.start(THREE_MINUTES)
      clock.elapse(3 * MINUTE)

      expect(inWriting(session).isLast).toBe(true)
      writeRight(session)
      session.next()

      expect(inResults(session).score).toMatchObject({ checked: 1, points: 1, maxPoints: 1 })
    })

    it('opens the results at once after a right check in the quick mode once the time is up', () => {
      const { session, clock } = setup({
        exercise: 'write',
        difficulty: FIRST_STEPS,
        autoAdvance: true,
      })
      session.start(THREE_MINUTES)
      clock.elapse(3 * MINUTE)

      writeRight(session)

      expect(inResults(session).score).toMatchObject({ checked: 1 })
    })
  })

  // Criterion 4 and edge case 3.
  describe('finish', () => {
    it('opens the results of the checked questions before the time is up', () => {
      const { session, clock } = setup()
      session.start(THREE_MINUTES)
      answerRight(session)
      session.next()
      answerWrong(session)
      session.next()
      clock.elapse(MINUTE)

      session.finish()

      expect(inResults(session).score).toMatchObject({ checked: 2, points: 3, maxPoints: 4 })
    })

    it('returns to the length choice when nothing was checked', () => {
      const { session, clock } = setup()
      session.start(THREE_MINUTES)
      clock.elapse(MINUTE)

      session.finish()

      expect(session.state.phase).toBe('choosing')
    })

    it('returns to the length choice when the time is up and nothing was checked', () => {
      const { session, clock } = setup()
      session.start(THREE_MINUTES)
      clock.elapse(3 * MINUTE)

      session.finish()

      expect(session.state.phase).toBe('choosing')
    })
  })

  // Criterion 5: the same score as any other session, the answer time among it.
  describe('results', () => {
    it('hold the points, the questions, the best streak and the answer time', () => {
      const { session, clock } = setup()
      session.start(THREE_MINUTES)
      session.noteDrawn()
      clock.elapse(2 * SECOND)
      answerRight(session)
      session.next()
      session.noteDrawn()
      clock.elapse(4 * SECOND)
      answerRight(session)
      session.next()
      clock.elapse(3 * MINUTE)
      answerWrong(session)
      session.next()

      const { score } = inResults(session)
      expect(score).toMatchObject({ checked: 3, points: 5, maxPoints: 6, bestStreak: 2 })
      expect(averageTimeMs(score)).toBe(2 * SECOND)
    })
  })
})
