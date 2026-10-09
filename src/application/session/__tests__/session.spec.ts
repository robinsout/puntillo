import { describe, expect, it } from 'vitest'
import type { Clock } from '@/application/ports'
import { createSession } from '@/application/session'
import type { Session, SessionState } from '@/application/session'
import { presetDifficulty, type Difficulty } from '@/domain/difficulty'
import { LETTERS } from '@/domain/pitch'
import type { Letter } from '@/domain/pitch'
import type { Duration, Question } from '@/domain/question'
import { createQuestion, DURATION_VALUES } from '@/domain/question'
import { averageTimeMs } from '@/domain/session'
import type { SessionLength } from '@/domain/session'

const CONFIDENT_READING = presetDifficulty('confident-reading')
const FIRST_STEPS = presetDifficulty('first-steps')

// Whatever the difficulty, the questions go C4, D4… as whole notes; the difficulty each session
// asked for is recorded.
function questionSource() {
  const served: Question[] = []
  const difficulties: Difficulty[] = []
  const next = () => {
    const letter = LETTERS[served.length % LETTERS.length] ?? 'C'
    const question = createQuestion({ pitch: { letter, octave: 4 }, duration: { value: 'whole' } })
    served.push(question)
    return question
  }
  const questionsFor = (difficulty: Difficulty) => {
    difficulties.push(difficulty)
    return next
  }
  return { questionsFor, served, difficulties }
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
}

// Stands for the preferences, which remember both modes and the difficulty between page loads.
// Unless told otherwise the difficulty is Confident reading, which asks for the duration.
function rememberedModes(initial: Partial<Modes> = {}) {
  const modes: Modes = {
    autoAdvance: false,
    showAnswerAtOnce: false,
    difficulty: CONFIDENT_READING,
    ...initial,
  }
  const changes: string[] = []
  const preferences = {
    get difficulty() {
      return modes.difficulty
    },
    set difficulty(chosen: Difficulty) {
      modes.difficulty = chosen
    },
    get autoAdvance() {
      return modes.autoAdvance
    },
    get showAnswerAtOnce() {
      return modes.showAnswerAtOnce
    },
    chooseAutoAdvance(on: boolean) {
      modes.autoAdvance = on
      changes.push(`autoAdvance ${on}`)
    },
    chooseShowAnswerAtOnce(on: boolean) {
      modes.showAnswerAtOnce = on
      changes.push(`showAnswerAtOnce ${on}`)
    },
  }
  return { preferences, changes }
}

function setup(remembered: Partial<Modes> = {}) {
  const source = questionSource()
  const time = fakeClock()
  const modes = rememberedModes(remembered)
  const session = createSession(source.questionsFor, time.clock, modes.preferences)
  return { session, source, clock: time, modes }
}

type QuestionPhase = Extract<SessionState, { phase: 'question' }>
type ResultsPhase = Extract<SessionState, { phase: 'results' }>

function inQuestion(session: Session): QuestionPhase {
  const { state } = session
  if (state.phase !== 'question') throw new Error(`expected question phase, got ${state.phase}`)
  return state
}

function inResults(session: Session): ResultsPhase {
  const { state } = session
  if (state.phase !== 'results') throw new Error(`expected results phase, got ${state.phase}`)
  return state
}

const rightLetter = (session: Session): Letter =>
  inQuestion(session).trainer.question.note.pitch.letter

const wrongLetter = (session: Session): Letter => (rightLetter(session) === 'C' ? 'D' : 'C')

const rightDuration = (session: Session): Duration =>
  inQuestion(session).trainer.question.note.duration

const wrongDuration = (session: Session): Duration =>
  rightDuration(session).value === 'whole' ? { value: 'half' } : { value: 'whole' }

const anotherWrongDuration = (session: Session): Duration => {
  const { trainer } = inQuestion(session)
  const value = DURATION_VALUES.find(
    (candidate) =>
      candidate !== rightDuration(session).value && candidate !== trainer.wrongDuration?.value,
  )
  if (!value) throw new Error('no wrong duration left')
  return { value }
}

const anotherWrongLetter = (session: Session): Letter => {
  const { trainer } = inQuestion(session)
  const letter = LETTERS.find(
    (candidate) => candidate !== rightLetter(session) && candidate !== trainer.wrongChoice,
  )
  if (!letter) throw new Error('no wrong letter left')
  return letter
}

// The scene draws the note before the names can be pressed, so a whole answer starts there.
function answerRight(session: Session) {
  session.noteDrawn()
  checkRight(session)
}

// Both attempts wrong: the question is over and counted as incorrect.
function answerWrong(session: Session) {
  session.noteDrawn()
  checkWrong(session)
  checkWrongAgain(session)
}

function answerRightOnSecondTry(session: Session) {
  session.noteDrawn()
  checkWrong(session)
  checkRight(session)
}

function checkRight(session: Session) {
  session.select(rightLetter(session))
  session.selectDuration(rightDuration(session))
  session.check()
}

// Only the name is wrong, so the second attempt is on the name and the duration earns its point.
function checkWrong(session: Session) {
  session.select(wrongLetter(session))
  session.selectDuration(rightDuration(session))
  session.check()
}

function checkWrongAgain(session: Session) {
  session.select(anotherWrongLetter(session))
  session.check()
}

// In the quick mode the press that completes a name and a duration answers; these helpers choose
// the duration first, so the name press answers.
function answerQuickRight(session: Session) {
  session.noteDrawn()
  session.selectDuration(rightDuration(session))
  session.answer(rightLetter(session))
}

// Only the first press, wrong: the quick mode stops on the question for the second attempt.
function missQuick(session: Session) {
  session.noteDrawn()
  session.selectDuration(rightDuration(session))
  session.answer(wrongLetter(session))
}

function answerQuickRightOnSecondTry(session: Session) {
  missQuick(session)
  session.answer(rightLetter(session))
}

// Both presses wrong: the review stops the quick mode until next.
function answerQuickWrong(session: Session) {
  missQuick(session)
  session.answer(anotherWrongLetter(session))
  session.next()
}

function goToQuestion(session: Session, target: number) {
  while (inQuestion(session).number < target) {
    answerRight(session)
    session.next()
  }
}

describe('session', () => {
  describe('when opened', () => {
    it('asks for the session length', () => {
      const { session } = setup()

      expect(session.state).toEqual({ phase: 'choosing' })
    })

    it('does not ask for a question before the length is chosen', () => {
      const { source } = setup()

      expect(source.served).toHaveLength(0)
    })

    it('has automatic advance off', () => {
      const { session } = setup()

      expect(session.autoAdvance).toBe(false)
    })

    it('has showing the right answer at once off', () => {
      const { session } = setup()

      expect(session.showAnswerAtOnce).toBe(false)
    })
  })

  describe('starting', () => {
    it.each<SessionLength>([10, 20, 50, 'unlimited'])(
      'with length %s opens question 1 of that length',
      (length) => {
        const { session } = setup()

        session.start(length)

        const state = inQuestion(session)
        expect(state.length).toBe(length)
        expect(state.number).toBe(1)
      },
    )

    it('shows the first question from the source, not yet answered', () => {
      const { session, source } = setup()

      session.start(10)

      const { trainer } = inQuestion(session)
      expect(source.served).toHaveLength(1)
      expect(trainer.question).toBe(source.served[0])
      expect(trainer.selected).toBeNull()
      expect(trainer.outcome).toBeNull()
      expect(trainer.hint).toBe(false)
    })

    it('starts with an empty score', () => {
      const { session } = setup()

      session.start(10)

      expect(inQuestion(session).score).toEqual({
        checked: 0,
        points: 0,
        maxPoints: 0,
        streak: 0,
        bestStreak: 0,
        totalTimeMs: 0,
      })
    })
  })

  describe('inside a question', () => {
    it('passes the chosen name through', () => {
      const { session } = setup()
      session.start(10)

      session.select('G')

      expect(inQuestion(session).trainer.selected).toBe('G')
    })

    it('passes the chosen duration through', () => {
      const { session } = setup()
      session.start(10)

      session.selectDuration({ value: 'eighth' })

      expect(inQuestion(session).trainer.selectedDuration).toEqual({ value: 'eighth' })
    })

    it('shows the hint on check with a name but no duration', () => {
      const { session } = setup()
      session.start(10)
      session.noteDrawn()
      session.select(rightLetter(session))

      session.check()

      const state = inQuestion(session)
      expect(state.trainer.hint).toBe(true)
      expect(state.trainer.firstGrade).toBeNull()
      expect(state.score.checked).toBe(0)
    })

    it('ignores a chosen duration outside a question', () => {
      const { session } = setup()

      session.selectDuration({ value: 'half' })

      expect(session.state).toEqual({ phase: 'choosing' })
    })

    it('grades the checked answer', () => {
      const { session } = setup()
      session.start(10)

      answerRight(session)

      expect(inQuestion(session).trainer.outcome).toBe('correct')
    })
  })

  describe('second attempt', () => {
    it('opens after a wrong first check, on the same question', () => {
      const { session, source } = setup()
      session.start(10)
      const wrong = wrongLetter(session)

      session.noteDrawn()
      checkWrong(session)

      const state = inQuestion(session)
      expect(state.number).toBe(1)
      expect(state.trainer.question).toBe(source.served[0])
      expect(state.trainer.wrongChoice).toBe(wrong)
      expect(state.trainer.selected).toBeNull()
      expect(state.trainer.outcome).toBeNull()
    })

    it('does not move on to the next question', () => {
      const { session, source } = setup()
      session.start(10)
      session.noteDrawn()
      checkWrong(session)

      session.next()

      expect(inQuestion(session).number).toBe(1)
      expect(source.served).toHaveLength(1)
    })

    it('does not lead to the results on the last question', () => {
      const { session } = setup()
      session.start(10)
      goToQuestion(session, 10)
      session.noteDrawn()
      checkWrong(session)

      session.next()

      expect(inQuestion(session).number).toBe(10)
    })

    it('ends the question as correct on the second try when right, then next moves on', () => {
      const { session } = setup()
      session.start(10)

      answerRightOnSecondTry(session)
      expect(inQuestion(session).trainer.outcome).toBe('correct-second-try')

      session.next()
      expect(inQuestion(session).number).toBe(2)
    })

    it('ends the question as incorrect when wrong again, then next moves on', () => {
      const { session } = setup()
      session.start(10)

      answerWrong(session)
      expect(inQuestion(session).trainer.outcome).toBe('incorrect')

      session.next()
      expect(inQuestion(session).number).toBe(2)
    })

    it('leads to the results after the second check on the last question', () => {
      const { session } = setup()
      session.start(10)
      goToQuestion(session, 10)

      answerRightOnSecondTry(session)
      session.next()

      expect(inResults(session).score).toMatchObject({ checked: 10, points: 19, maxPoints: 20 })
    })

    it('shows the hint on check without a name', () => {
      const { session } = setup()
      session.start(10)
      session.noteDrawn()
      checkWrong(session)

      session.check()

      const state = inQuestion(session)
      expect(state.trainer.hint).toBe(true)
      expect(state.trainer.outcome).toBeNull()
      expect(state.score.checked).toBe(1)
    })
  })

  describe('question number', () => {
    it('grows by one on next after the result', () => {
      const { session, source } = setup()
      session.start(10)

      answerRight(session)
      session.next()

      const state = inQuestion(session)
      expect(state.number).toBe(2)
      expect(state.trainer.question).toBe(source.served[1])
      expect(state.trainer.outcome).toBeNull()
    })

    it('does not change on next before the result', () => {
      const { session } = setup()
      session.start(10)

      session.next()

      expect(inQuestion(session).number).toBe(1)
    })

    it('does not change on the hint (check without a chosen name)', () => {
      const { session } = setup()
      session.start(10)

      session.check()
      session.next()

      const state = inQuestion(session)
      expect(state.trainer.hint).toBe(true)
      expect(state.number).toBe(1)
    })
  })

  describe('score', () => {
    it('gives both points for the right name and duration', () => {
      const { session } = setup()
      session.start(10)

      answerRight(session)

      expect(inQuestion(session).score).toMatchObject({ checked: 1, points: 2, maxPoints: 2 })
    })

    it('gives the point of the duration only when the name is wrong', () => {
      const { session } = setup()
      session.start(10)

      answerWrong(session)

      expect(inQuestion(session).score).toMatchObject({ checked: 1, points: 1, maxPoints: 2 })
    })

    it('counts a wrong first attempt at once, before the second one', () => {
      const { session } = setup()
      session.start(10)
      session.noteDrawn()

      checkWrong(session)

      expect(inQuestion(session).score).toMatchObject({ checked: 1, points: 1, maxPoints: 2 })
    })

    it('counts a question right on the second try by its first attempt, once', () => {
      const { session } = setup()
      session.start(10)

      answerRightOnSecondTry(session)

      expect(inQuestion(session).score).toMatchObject({ checked: 1, points: 1, maxPoints: 2 })
    })

    it('counts a question wrong on both attempts once', () => {
      const { session } = setup()
      session.start(10)

      answerWrong(session)

      expect(inQuestion(session).score).toMatchObject({ checked: 1, points: 1, maxPoints: 2 })
    })

    it('does not count the hint', () => {
      const { session } = setup()
      session.start(10)

      session.check()

      expect(inQuestion(session).score).toMatchObject({ checked: 0, points: 0, maxPoints: 0 })
    })

    it('does not count the same question twice when check is pressed again', () => {
      const { session } = setup()
      session.start(10)

      answerRight(session)
      session.check()

      expect(inQuestion(session).score).toMatchObject({ checked: 1, points: 2, maxPoints: 2 })
    })

    it('adds up over several questions', () => {
      const { session } = setup()
      session.start(10)

      answerRight(session)
      session.next()
      answerWrong(session)
      session.next()
      answerRight(session)

      expect(inQuestion(session).score).toMatchObject({ checked: 3, points: 5, maxPoints: 6 })
    })

    it('gives the point of the name only when the duration is wrong', () => {
      const { session } = setup()
      session.start(10)
      session.noteDrawn()

      session.select(rightLetter(session))
      session.selectDuration(wrongDuration(session))
      session.check()

      expect(inQuestion(session).score).toMatchObject({ checked: 1, points: 1, maxPoints: 2 })
    })

    it('gives no point when both the name and the duration are wrong', () => {
      const { session } = setup()
      session.start(10)
      session.noteDrawn()

      session.select(wrongLetter(session))
      session.selectDuration(wrongDuration(session))
      session.check()

      expect(inQuestion(session).score).toMatchObject({ checked: 1, points: 0, maxPoints: 2 })
    })

    it('does not add the points of a right second attempt', () => {
      const { session } = setup()
      session.start(10)
      session.noteDrawn()
      session.select(wrongLetter(session))
      session.selectDuration(wrongDuration(session))
      session.check()

      checkRight(session)

      const state = inQuestion(session)
      expect(state.trainer.outcome).toBe('correct-second-try')
      expect(state.score).toMatchObject({ checked: 1, points: 0, maxPoints: 2 })
    })
  })

  describe('second attempt on the duration', () => {
    function triedWrongDuration() {
      const context = setup()
      context.session.start(10)
      context.session.noteDrawn()
      context.session.select(rightLetter(context.session))
      context.session.selectDuration(wrongDuration(context.session))
      context.session.check()
      return context
    }

    it('opens on the same question with the right name kept', () => {
      const { session } = triedWrongDuration()

      const state = inQuestion(session)
      expect(state.number).toBe(1)
      expect(state.trainer.outcome).toBeNull()
      expect(state.trainer.selected).toBe(rightLetter(session))
      expect(state.trainer.wrongDuration).toEqual(wrongDuration(session))
      expect(state.trainer.selectedDuration).toBeNull()
    })

    it('ends the question as correct on the second try with the right duration', () => {
      const { session } = triedWrongDuration()

      session.selectDuration(rightDuration(session))
      session.check()

      expect(inQuestion(session).trainer.outcome).toBe('correct-second-try')
      expect(inQuestion(session).score).toMatchObject({ checked: 1, points: 1, streak: 0 })
    })

    it('ends the question as incorrect with a wrong duration again', () => {
      const { session } = triedWrongDuration()

      session.selectDuration({ value: 'eighth' })
      session.check()

      expect(inQuestion(session).trainer.outcome).toBe('incorrect')
    })
  })

  describe('streak', () => {
    it('grows with each fully correct check in a row', () => {
      const { session } = setup()
      session.start(10)

      answerRight(session)
      expect(inQuestion(session).score.streak).toBe(1)

      session.next()
      answerRight(session)
      expect(inQuestion(session).score.streak).toBe(2)
    })

    it('drops to zero on a wrong check', () => {
      const { session } = setup()
      session.start(10)
      answerRight(session)
      session.next()

      answerWrong(session)

      expect(inQuestion(session).score.streak).toBe(0)
    })

    it('drops to zero when only the duration is wrong', () => {
      const { session } = setup()
      session.start(10)
      answerRight(session)
      session.next()
      session.noteDrawn()

      session.select(rightLetter(session))
      session.selectDuration(wrongDuration(session))
      session.check()

      expect(inQuestion(session).score).toMatchObject({ streak: 0, bestStreak: 1 })
    })

    it('drops to zero when only the second attempt is right', () => {
      const { session } = setup()
      session.start(10)
      answerRight(session)
      session.next()

      answerRightOnSecondTry(session)

      expect(inQuestion(session).score).toMatchObject({ streak: 0, bestStreak: 1 })
    })

    it('does not change on the hint', () => {
      const { session } = setup()
      session.start(10)
      answerRight(session)
      session.next()

      session.check()

      expect(inQuestion(session).score).toMatchObject({ streak: 1, bestStreak: 1 })
    })

    it('does not grow twice when check is pressed again', () => {
      const { session } = setup()
      session.start(10)

      answerRight(session)
      session.check()

      expect(inQuestion(session).score).toMatchObject({ streak: 1, bestStreak: 1 })
    })

    it('works without a limit', () => {
      const { session } = setup()
      session.start('unlimited')

      answerRight(session)
      session.next()
      answerRight(session)

      expect(inQuestion(session).score).toMatchObject({
        checked: 2,
        points: 4,
        maxPoints: 4,
        streak: 2,
      })
    })
  })

  describe('last question of a fixed session', () => {
    it.each<10 | 20 | 50>([10, 20, 50])(
      'is the question whose number equals the length %i',
      (length) => {
        const { session } = setup()
        session.start(length)

        goToQuestion(session, length - 1)
        expect(inQuestion(session).isLast).toBe(false)

        answerRight(session)
        session.next()

        const state = inQuestion(session)
        expect(state.number).toBe(length)
        expect(state.isLast).toBe(true)
      },
    )

    it('stays on the question after the check, showing the result', () => {
      const { session } = setup()
      session.start(10)
      goToQuestion(session, 10)

      answerWrong(session)

      const state = inQuestion(session)
      expect(state.isLast).toBe(true)
      expect(state.trainer.outcome).toBe('incorrect')
    })

    it('leads to the results on next', () => {
      const { session } = setup()
      session.start(10)
      goToQuestion(session, 10)

      answerWrong(session)
      session.next()

      expect(inResults(session).score).toMatchObject({ checked: 10, points: 19, maxPoints: 20 })
    })

    it('does not lead to the results on next before the check', () => {
      const { session } = setup()
      session.start(10)
      goToQuestion(session, 10)

      session.next()
      session.check()
      session.next()

      const state = inQuestion(session)
      expect(state.number).toBe(10)
      expect(state.trainer.hint).toBe(true)
    })
  })

  describe('without a limit', () => {
    it('never has a last question and never reaches the results', () => {
      const { session } = setup()
      session.start('unlimited')

      for (let number = 1; number <= 60; number += 1) {
        const state = inQuestion(session)
        expect(state.number).toBe(number)
        expect(state.isLast).toBe(false)
        answerRight(session)
        session.next()
      }

      expect(inQuestion(session).number).toBe(61)
    })
  })

  describe('results', () => {
    it('hold the score of the session', () => {
      const { session } = setup()
      session.start(10)
      goToQuestion(session, 8)
      answerWrong(session)
      session.next()
      answerWrong(session)
      session.next()
      answerRight(session)
      session.next()

      expect(inResults(session).score).toMatchObject({ checked: 10, points: 18, maxPoints: 20 })
    })

    it('hold the best streak of the session, even when the run was broken later', () => {
      const { session } = setup()
      session.start(10)
      goToQuestion(session, 5)
      answerWrong(session)
      session.next()
      answerRight(session)
      session.next()
      answerWrong(session)
      session.next()
      goToQuestion(session, 10)
      answerWrong(session)
      session.next()

      expect(inResults(session).score).toMatchObject({ streak: 0, bestStreak: 4 })
    })
  })

  describe('finish', () => {
    it('opens the results with the score of the checked questions', () => {
      const { session } = setup()
      session.start(10)
      answerRight(session)
      session.next()
      answerRight(session)
      session.next()
      answerWrong(session)
      session.next()
      answerRight(session)

      session.finish()

      expect(inResults(session).score).toMatchObject({
        checked: 4,
        points: 7,
        maxPoints: 8,
        streak: 1,
        bestStreak: 2,
      })
    })

    it('leaves out the shown question that was not checked', () => {
      const { session } = setup()
      session.start(10)
      answerRight(session)
      session.next()
      session.select(wrongLetter(session))

      session.finish()

      expect(inResults(session).score).toMatchObject({
        checked: 1,
        points: 2,
        maxPoints: 2,
        bestStreak: 1,
      })
    })

    it('leaves out the shown question that only got the hint', () => {
      const { session } = setup()
      session.start(10)
      answerRight(session)
      session.next()
      session.check()

      session.finish()

      expect(inResults(session).score).toMatchObject({ checked: 1, points: 2, maxPoints: 2 })
    })

    it('counts the question as incorrect when finished during the second attempt', () => {
      const { session } = setup()
      session.start(10)
      answerRight(session)
      session.next()
      session.noteDrawn()
      checkWrong(session)
      session.select(rightLetter(session))

      session.finish()

      expect(inResults(session).score).toMatchObject({
        checked: 2,
        points: 3,
        maxPoints: 4,
        streak: 0,
        bestStreak: 1,
      })
    })

    it('opens the results when the only question was left during its second attempt', () => {
      const { session } = setup()
      session.start(10)
      session.noteDrawn()
      checkWrong(session)

      session.finish()

      expect(inResults(session).score).toMatchObject({ checked: 1, points: 1, maxPoints: 2 })
    })

    it('returns to the length choice when nothing was checked', () => {
      const { session } = setup()
      session.start(10)
      session.select('G')

      session.finish()

      expect(session.state).toEqual({ phase: 'choosing' })
    })

    it('returns to the length choice when only the hint was shown', () => {
      const { session } = setup()
      session.start(10)
      session.check()

      session.finish()

      expect(session.state).toEqual({ phase: 'choosing' })
    })

    it('opens the results without a limit, holding the checked questions', () => {
      const { session } = setup()
      session.start('unlimited')
      goToQuestion(session, 53)
      answerWrong(session)

      session.finish()

      expect(inResults(session).score).toMatchObject({
        checked: 53,
        points: 105,
        maxPoints: 106,
        bestStreak: 52,
      })
    })

    it('keeps automatic advance off after finishing', () => {
      const { session } = setup()
      session.start(10)
      answerRight(session)

      session.finish()

      expect(session.autoAdvance).toBe(false)
    })
  })

  describe('answer time', () => {
    it('runs from the note being drawn to the check, leaving out the loading before it', () => {
      const { session, clock } = setup()
      session.start(10)
      clock.elapse(700)
      session.noteDrawn()
      clock.elapse(2400)

      checkRight(session)

      expect(inQuestion(session).score.totalTimeMs).toBe(2400)
    })

    it('counts a wrong answer too', () => {
      const { session, clock } = setup()
      session.start(10)
      session.noteDrawn()
      clock.elapse(3100)

      checkWrong(session)

      expect(inQuestion(session).score.totalTimeMs).toBe(3100)
    })

    it('stops at the first attempt, leaving out the time of the second one', () => {
      const { session, clock } = setup()
      session.start(10)
      session.noteDrawn()
      clock.elapse(1800)
      checkWrong(session)
      clock.elapse(4000)

      checkRight(session)

      expect(inQuestion(session).score.totalTimeMs).toBe(1800)
    })

    it('does not grow when the second attempt is wrong too', () => {
      const { session, clock } = setup()
      session.start(10)
      session.noteDrawn()
      clock.elapse(1800)
      checkWrong(session)
      clock.elapse(4000)

      checkWrongAgain(session)

      expect(inQuestion(session).score.totalTimeMs).toBe(1800)
    })

    it('keeps running through the hint', () => {
      const { session, clock } = setup()
      session.start(10)
      session.noteDrawn()
      clock.elapse(1000)
      session.check()
      expect(inQuestion(session).score.totalTimeMs).toBe(0)

      clock.elapse(1500)
      checkRight(session)

      expect(inQuestion(session).score.totalTimeMs).toBe(2500)
    })

    it('does not restart when the same note is drawn again', () => {
      const { session, clock } = setup()
      session.start(10)
      session.noteDrawn()
      clock.elapse(1000)
      session.noteDrawn()
      clock.elapse(1000)

      checkRight(session)

      expect(inQuestion(session).score.totalTimeMs).toBe(2000)
    })

    it('does not grow when check is pressed again after the result', () => {
      const { session, clock } = setup()
      session.start(10)
      session.noteDrawn()
      clock.elapse(2000)
      checkRight(session)
      clock.elapse(3000)

      session.check()

      expect(inQuestion(session).score.totalTimeMs).toBe(2000)
    })

    it('times each question from its own note, leaving out the time between questions', () => {
      const { session, clock } = setup()
      session.start(10)
      session.noteDrawn()
      clock.elapse(2000)
      checkRight(session)
      clock.elapse(4000)
      session.next()
      clock.elapse(300)
      session.noteDrawn()
      clock.elapse(1000)

      checkWrong(session)

      const { score } = inQuestion(session)
      expect(score.totalTimeMs).toBe(3000)
      expect(averageTimeMs(score)).toBe(1500)
    })

    it('counts zero for a check that comes before the note is drawn', () => {
      const { session, clock } = setup()
      session.start(10)
      clock.elapse(1200)

      checkRight(session)

      expect(inQuestion(session).score).toMatchObject({ checked: 1, totalTimeMs: 0 })
    })

    it('is ignored outside a question', () => {
      const { session } = setup()

      session.noteDrawn()

      expect(session.state).toEqual({ phase: 'choosing' })
    })
  })

  describe('average time in the results', () => {
    it('is the mean over all questions of a finished fixed session', () => {
      const { session, clock } = setup()
      session.start(10)
      for (let number = 1; number <= 10; number += 1) {
        session.noteDrawn()
        clock.elapse(number * 200)
        checkRight(session)
        session.next()
      }

      // 200 + 400 + ... + 2000 = 11000 over 10 questions
      expect(averageTimeMs(inResults(session).score)).toBe(1100)
    })

    it('leaves out the shown question that was not checked when finishing', () => {
      const { session, clock } = setup()
      session.start(10)
      session.noteDrawn()
      clock.elapse(2000)
      checkRight(session)
      session.next()
      session.noteDrawn()
      clock.elapse(9000)

      session.finish()

      const { score } = inResults(session)
      expect(score.totalTimeMs).toBe(2000)
      expect(averageTimeMs(score)).toBe(2000)
    })

    it('leaves out the shown question that only got the hint when finishing', () => {
      const { session, clock } = setup()
      session.start('unlimited')
      session.noteDrawn()
      clock.elapse(1000)
      checkWrong(session)
      checkWrongAgain(session)
      session.next()
      session.noteDrawn()
      clock.elapse(4000)
      session.check()

      session.finish()

      expect(averageTimeMs(inResults(session).score)).toBe(1000)
    })
  })

  describe('new session', () => {
    function inResultsOf(length: 10 | 20 | 50) {
      const context = setup()
      context.session.start(length)
      goToQuestion(context.session, length)
      answerWrong(context.session)
      context.session.next()
      return context
    }

    it('returns to the length choice', () => {
      const { session } = inResultsOf(10)

      session.newSession()

      expect(session.state).toEqual({ phase: 'choosing' })
    })

    it('starts from question 1 with a new question and an empty score', () => {
      const { session, source } = inResultsOf(10)
      const lastShown = source.served.at(-1)

      session.newSession()
      session.start(20)

      const state = inQuestion(session)
      expect(state.length).toBe(20)
      expect(state.number).toBe(1)
      expect(state.isLast).toBe(false)
      expect(state.score).toEqual({
        checked: 0,
        points: 0,
        maxPoints: 0,
        streak: 0,
        bestStreak: 0,
        totalTimeMs: 0,
      })
      expect(state.trainer.question).not.toBe(lastShown)
      expect(state.trainer.question).toBe(source.served.at(-1))
      expect(state.trainer.selected).toBeNull()
      expect(state.trainer.outcome).toBeNull()
      expect(state.trainer.wrongChoice).toBeNull()
      expect(state.trainer.hint).toBe(false)
    })

    it('counts the time from zero', () => {
      const { session, clock } = setup()
      session.start(10)
      session.noteDrawn()
      clock.elapse(5000)
      checkRight(session)
      session.next()
      session.noteDrawn()
      clock.elapse(7000)
      session.finish()

      session.newSession()
      session.start(10)
      expect(inQuestion(session).score.totalTimeMs).toBe(0)

      clock.elapse(300)
      session.noteDrawn()
      clock.elapse(1000)
      checkRight(session)

      expect(inQuestion(session).score.totalTimeMs).toBe(1000)
    })

    it('starts the streak and the best streak from zero', () => {
      const { session } = setup()
      session.start(10)
      goToQuestion(session, 10)
      answerRight(session)
      session.next()
      expect(inResults(session).score.bestStreak).toBe(10)

      session.newSession()
      session.start(10)

      expect(inQuestion(session).score).toMatchObject({ streak: 0, bestStreak: 0 })
    })

    it('keeps the quick mode on between sessions', () => {
      const { session } = setup()
      session.setAutoAdvance(true)
      session.start(10)
      answerQuickRight(session)
      session.finish()

      session.newSession()
      session.start(10)
      answerQuickRight(session)

      expect(session.autoAdvance).toBe(true)
      expect(inQuestion(session).number).toBe(2)
    })

    it('keeps the quick mode off between sessions once turned off', () => {
      const { session } = setup()
      session.setAutoAdvance(true)
      session.start(10)
      session.setAutoAdvance(false)
      goToQuestion(session, 10)
      answerRight(session)
      session.next()

      session.newSession()
      session.start(10)
      answerRight(session)

      const state = inQuestion(session)
      expect(session.autoAdvance).toBe(false)
      expect(state.number).toBe(1)
      expect(state.trainer.outcome).toBe('correct')
    })
  })

  // Criteria 1 and 5: the setting is changed on the length choice and holds for the session.
  describe('showing the right answer at once', () => {
    function atOnce(length: SessionLength = 10) {
      const context = setup()
      context.session.setShowAnswerAtOnce(true)
      context.session.start(length)
      return context
    }

    function answerWrongOnce(session: Session) {
      session.noteDrawn()
      checkWrong(session)
    }

    it('is turned on on the length choice', () => {
      const { session } = setup()

      session.setShowAnswerAtOnce(true)

      expect(session.showAnswerAtOnce).toBe(true)
      expect(session.state).toEqual({ phase: 'choosing' })
    })

    it('ends the question as incorrect after a wrong first check, with no second attempt', () => {
      const { session, source } = atOnce()
      const wrong = wrongLetter(session)

      answerWrongOnce(session)

      const state = inQuestion(session)
      expect(state.number).toBe(1)
      expect(state.trainer.question).toBe(source.served[0])
      expect(state.trainer.outcome).toBe('incorrect')
      expect(state.trainer.selected).toBe(wrong)
      expect(state.trainer.wrongChoice).toBe(wrong)
    })

    it('ends the question as incorrect after a wrong duration, keeping it for the review', () => {
      const { session } = atOnce()
      const wrong = wrongDuration(session)
      session.noteDrawn()

      session.select(rightLetter(session))
      session.selectDuration(wrong)
      session.check()

      const { trainer, score } = inQuestion(session)
      expect(trainer.outcome).toBe('incorrect')
      expect(trainer.selectedDuration).toEqual(wrong)
      expect(trainer.wrongDuration).toEqual(wrong)
      expect(score).toMatchObject({ checked: 1, points: 1, maxPoints: 2 })
    })

    it('ends the question as correct after a right first check', () => {
      const { session } = atOnce()

      answerRight(session)

      expect(inQuestion(session).trainer.outcome).toBe('correct')
    })

    it('moves on to the next question on next after the wrong answer', () => {
      const { session, source } = atOnce()
      answerWrongOnce(session)

      session.next()

      const state = inQuestion(session)
      expect(state.number).toBe(2)
      expect(state.trainer.question).toBe(source.served[1])
      expect(state.trainer.outcome).toBeNull()
      expect(state.trainer.wrongChoice).toBeNull()
    })

    it('leads to the results on next after a wrong answer to the last question', () => {
      const { session } = atOnce()
      goToQuestion(session, 10)
      answerWrongOnce(session)

      session.next()

      expect(inResults(session).score).toMatchObject({ checked: 10, points: 19, maxPoints: 20 })
    })

    it('counts the wrong answer once, like a wrong first attempt', () => {
      const { session } = atOnce()
      answerRight(session)
      session.next()

      answerWrongOnce(session)
      session.check()

      expect(inQuestion(session).score).toMatchObject({
        checked: 2,
        points: 3,
        maxPoints: 4,
        streak: 0,
        bestStreak: 1,
      })
    })

    it('times the answer from the note being drawn to the check', () => {
      const { session, clock } = atOnce()
      clock.elapse(300)
      session.noteDrawn()
      clock.elapse(1500)

      checkWrong(session)

      expect(inQuestion(session).score.totalTimeMs).toBe(1500)
    })

    it('stays on between sessions', () => {
      const { session } = atOnce()
      answerRight(session)
      session.finish()

      session.newSession()
      session.start(10)
      answerWrongOnce(session)

      expect(session.showAnswerAtOnce).toBe(true)
      expect(inQuestion(session).trainer.outcome).toBe('incorrect')
    })

    it('gives the second attempt again in a new session once turned off', () => {
      const { session } = atOnce()
      answerRight(session)
      session.finish()
      session.newSession()

      session.setShowAnswerAtOnce(false)
      session.start(10)
      answerWrongOnce(session)

      const state = inQuestion(session)
      expect(session.showAnswerAtOnce).toBe(false)
      expect(state.trainer.outcome).toBeNull()
      expect(state.trainer.wrongChoice).toBe(wrongLetter(session))
    })

    it('takes effect in a new session once turned on after a session without it', () => {
      const { session } = setup()
      session.start(10)
      answerRight(session)
      session.finish()
      session.newSession()

      session.setShowAnswerAtOnce(true)
      session.start(10)
      answerWrongOnce(session)

      expect(inQuestion(session).trainer.outcome).toBe('incorrect')
    })

    it('does not change the quick mode: they stay apart', () => {
      const { session } = setup()

      session.setShowAnswerAtOnce(true)

      expect(session.autoAdvance).toBe(false)
    })

    describe('in the quick mode', () => {
      function quickAtOnce() {
        const context = setup()
        context.session.setShowAnswerAtOnce(true)
        context.session.setAutoAdvance(true)
        context.session.start(10)
        return context
      }

      it('shows the review at once on a wrong answer, staying on the question', () => {
        const { session, source } = quickAtOnce()
        const wrong = wrongLetter(session)

        missQuick(session)

        const state = inQuestion(session)
        expect(state.number).toBe(1)
        expect(state.trainer.question).toBe(source.served[0])
        expect(state.trainer.outcome).toBe('incorrect')
        expect(state.trainer.selected).toBe(wrong)
        expect(state.score).toMatchObject({ checked: 1, points: 1, maxPoints: 2 })
      })

      it('ignores a name pressed on the review', () => {
        const { session } = quickAtOnce()
        missQuick(session)

        session.answer(rightLetter(session))

        const state = inQuestion(session)
        expect(state.number).toBe(1)
        expect(state.trainer.outcome).toBe('incorrect')
        expect(state.score).toMatchObject({ checked: 1, points: 1, maxPoints: 2 })
      })

      it('moves on on next after the review, with no previous result', () => {
        const { session, source } = quickAtOnce()
        missQuick(session)

        session.next()

        const state = inQuestion(session)
        expect(state.number).toBe(2)
        expect(state.trainer.question).toBe(source.served[1])
        expect(state.trainer.outcome).toBeNull()
        expect(state.previousOutcome).toBeNull()
      })

      it('opens the next question at once on a right answer', () => {
        const { session } = quickAtOnce()

        answerQuickRight(session)

        const state = inQuestion(session)
        expect(state.number).toBe(2)
        expect(state.previousOutcome).toBe('correct')
      })

      it('leads to the results on next after the review of the last question', () => {
        const { session } = quickAtOnce()
        for (let number = 1; number < 10; number += 1) answerQuickRight(session)
        missQuick(session)
        expect(inQuestion(session).number).toBe(10)

        session.next()

        expect(inResults(session).score).toMatchObject({ checked: 10, points: 19, maxPoints: 20 })
      })
    })
  })

  describe('with the quick mode off', () => {
    it('has no previous result on the first question', () => {
      const { session } = setup()

      session.start(10)

      expect(inQuestion(session).previousOutcome).toBeNull()
    })

    it('shows the result on the question itself, not as the previous one', () => {
      const { session } = setup()
      session.start(10)

      answerWrong(session)

      const state = inQuestion(session)
      expect(state.trainer.outcome).toBe('incorrect')
      expect(state.previousOutcome).toBeNull()
    })

    it('opens the next question without a previous result', () => {
      const { session } = setup()
      session.start(10)

      answerRight(session)
      session.next()

      expect(inQuestion(session).previousOutcome).toBeNull()
    })

    it('ignores the one-tap answer', () => {
      const { session } = setup()
      session.start(10)
      session.noteDrawn()

      session.answer(rightLetter(session))

      const state = inQuestion(session)
      expect(state.number).toBe(1)
      expect(state.trainer.firstGrade).toBeNull()
      expect(state.score.checked).toBe(0)
    })

    it('ignores the one-tap duration', () => {
      const { session } = setup()
      session.start(10)
      session.noteDrawn()
      session.select(rightLetter(session))

      session.answerDuration(rightDuration(session))

      const state = inQuestion(session)
      expect(state.number).toBe(1)
      expect(state.trainer.selectedDuration).toBeNull()
      expect(state.trainer.firstGrade).toBeNull()
      expect(state.score.checked).toBe(0)
    })
  })

  describe('with the quick mode on', () => {
    function quick(length: SessionLength = 10) {
      const context = setup()
      context.session.setAutoAdvance(true)
      context.session.start(length)
      return context
    }

    describe('answering by a name', () => {
      it('opens the next question at once, nothing chosen or graded on it', () => {
        const { session, source } = quick()

        answerQuickRight(session)

        const state = inQuestion(session)
        expect(state.number).toBe(2)
        expect(state.trainer.question).toBe(source.served[1])
        expect(state.trainer.selected).toBeNull()
        expect(state.trainer.firstGrade).toBeNull()
        expect(state.trainer.hint).toBe(false)
      })

      it('shows a correct answer as the previous result', () => {
        const { session } = quick()

        answerQuickRight(session)

        expect(inQuestion(session).previousOutcome).toBe('correct')
      })

      it('keeps the previous result while the new question is not answered', () => {
        const { session, clock } = quick()
        answerQuickRightOnSecondTry(session)

        session.noteDrawn()
        clock.elapse(5000)

        expect(inQuestion(session).previousOutcome).toBe('correct-second-try')
      })

      it('replaces the previous result with the next answer', () => {
        const { session } = quick()
        answerQuickRightOnSecondTry(session)

        answerQuickRight(session)

        const state = inQuestion(session)
        expect(state.number).toBe(3)
        expect(state.previousOutcome).toBe('correct')
      })

      it('has no previous result on the first question', () => {
        const { session } = quick()

        expect(inQuestion(session).previousOutcome).toBeNull()
      })

      it('counts a name chosen before the mode was turned on by the pressed name only', () => {
        const { session } = setup()
        session.start(10)
        session.select(wrongLetter(session))
        session.setAutoAdvance(true)

        answerQuickRight(session)

        expect(inQuestion(session).score).toMatchObject({ checked: 1, points: 2, maxPoints: 2 })
      })

      it('is ignored outside a question', () => {
        const { session } = setup()
        session.setAutoAdvance(true)

        session.answer('C')

        expect(session.state).toEqual({ phase: 'choosing' })
      })
    })

    // Feature mistake-review, criterion 9: a wrong press stops the quick mode on the question.
    describe('a wrong answer', () => {
      it('stays on the question for the second attempt, the wrong name kept out', () => {
        const { session, source } = quick()
        const wrong = wrongLetter(session)

        missQuick(session)

        const state = inQuestion(session)
        expect(state.number).toBe(1)
        expect(state.trainer.question).toBe(source.served[0])
        expect(source.served).toHaveLength(1)
        expect(state.trainer.wrongChoice).toBe(wrong)
        expect(state.trainer.selected).toBeNull()
        expect(state.trainer.outcome).toBeNull()
        expect(state.trainer.hint).toBe(false)
      })

      it('counts the wrong first attempt at once', () => {
        const { session } = quick()
        answerQuickRight(session)

        missQuick(session)

        expect(inQuestion(session).score).toMatchObject({
          checked: 2,
          points: 3,
          maxPoints: 4,
          streak: 0,
        })
      })

      it('ignores the wrong name pressed again', () => {
        const { session } = quick()
        const wrong = wrongLetter(session)
        missQuick(session)

        session.answer(wrong)

        const state = inQuestion(session)
        expect(state.number).toBe(1)
        expect(state.trainer.wrongChoice).toBe(wrong)
        expect(state.trainer.outcome).toBeNull()
        expect(state.trainer.hint).toBe(false)
        expect(state.score.checked).toBe(1)
      })

      it('does not move on on next during the second attempt', () => {
        const { session, source } = quick()
        missQuick(session)

        session.next()

        expect(inQuestion(session).number).toBe(1)
        expect(source.served).toHaveLength(1)
      })

      it('opens the next question at once when the second attempt is right', () => {
        const { session, source } = quick()

        answerQuickRightOnSecondTry(session)

        const state = inQuestion(session)
        expect(state.number).toBe(2)
        expect(state.trainer.question).toBe(source.served[1])
        expect(state.trainer.firstGrade).toBeNull()
        expect(state.trainer.wrongChoice).toBeNull()
        expect(state.trainer.outcome).toBeNull()
      })

      it('shows a question right on the second try as such in the previous result', () => {
        const { session } = quick()

        answerQuickRightOnSecondTry(session)

        expect(inQuestion(session).previousOutcome).toBe('correct-second-try')
      })

      it('counts a question right on the second try as incorrect, once', () => {
        const { session } = quick()
        answerQuickRight(session)

        answerQuickRightOnSecondTry(session)

        expect(inQuestion(session).score).toMatchObject({
          checked: 2,
          points: 3,
          maxPoints: 4,
          streak: 0,
          bestStreak: 1,
        })
      })

      it('shows the review on the question when the second attempt is wrong too', () => {
        const { session, source } = quick()
        missQuick(session)
        const wrongAgain = anotherWrongLetter(session)

        session.answer(wrongAgain)

        const state = inQuestion(session)
        expect(state.number).toBe(1)
        expect(state.trainer.question).toBe(source.served[0])
        expect(state.trainer.outcome).toBe('incorrect')
        expect(state.trainer.selected).toBe(wrongAgain)
        expect(state.score).toMatchObject({ checked: 1, points: 1, maxPoints: 2 })
      })

      it('ignores a name pressed on the review', () => {
        const { session } = quick()
        missQuick(session)
        session.answer(anotherWrongLetter(session))

        session.answer(rightLetter(session))

        const state = inQuestion(session)
        expect(state.number).toBe(1)
        expect(state.trainer.outcome).toBe('incorrect')
        expect(state.score).toMatchObject({ checked: 1, points: 1, maxPoints: 2 })
      })

      it('moves on on next after the review, with no previous result', () => {
        const { session, source } = quick()
        missQuick(session)
        session.answer(anotherWrongLetter(session))

        session.next()

        const state = inQuestion(session)
        expect(state.number).toBe(2)
        expect(state.trainer.question).toBe(source.served[1])
        expect(state.trainer.outcome).toBeNull()
        expect(state.previousOutcome).toBeNull()
        expect(state.score).toMatchObject({ checked: 1, points: 1, maxPoints: 2 })
      })

      it('times the answer to the first press only', () => {
        const { session, clock } = quick()
        session.noteDrawn()
        clock.elapse(1000)
        session.selectDuration(rightDuration(session))
        session.answer(wrongLetter(session))
        clock.elapse(4000)

        session.answer(rightLetter(session))

        expect(inQuestion(session).score.totalTimeMs).toBe(1000)
      })
    })

    // Feature duration-input, criteria 13 and 14: the answer is graded once both a name and a
    // duration are chosen, whichever comes first.
    describe('answering by a name and a duration', () => {
      it('does not grade a name pressed alone: it stays chosen, with no hint', () => {
        const { session, source } = quick()
        session.noteDrawn()
        const right = rightLetter(session)

        session.answer(right)

        const state = inQuestion(session)
        expect(state.number).toBe(1)
        expect(source.served).toHaveLength(1)
        expect(state.trainer.selected).toBe(right)
        expect(state.trainer.firstGrade).toBeNull()
        expect(state.trainer.hint).toBe(false)
        expect(state.score.checked).toBe(0)
      })

      it('does not grade a duration pressed alone: it stays chosen, with no hint', () => {
        const { session } = quick()
        session.noteDrawn()
        const duration = rightDuration(session)

        session.answerDuration(duration)

        const state = inQuestion(session)
        expect(state.number).toBe(1)
        expect(state.trainer.selectedDuration).toEqual(duration)
        expect(state.trainer.selected).toBeNull()
        expect(state.trainer.firstGrade).toBeNull()
        expect(state.trainer.hint).toBe(false)
        expect(state.score.checked).toBe(0)
      })

      it('grades on the duration pressed after the name: right opens the next question', () => {
        const { session, source } = quick()
        session.noteDrawn()
        session.answer(rightLetter(session))

        session.answerDuration(rightDuration(session))

        const state = inQuestion(session)
        expect(state.number).toBe(2)
        expect(state.trainer.question).toBe(source.served[1])
        expect(state.trainer.selected).toBeNull()
        expect(state.trainer.selectedDuration).toBeNull()
        expect(state.previousOutcome).toBe('correct')
        expect(state.score).toMatchObject({ checked: 1, points: 2, maxPoints: 2, streak: 1 })
      })

      it('grades on the name pressed after the duration: right opens the next question', () => {
        const { session } = quick()
        session.noteDrawn()
        session.answerDuration(rightDuration(session))

        session.answer(rightLetter(session))

        const state = inQuestion(session)
        expect(state.number).toBe(2)
        expect(state.previousOutcome).toBe('correct')
        expect(state.score).toMatchObject({ checked: 1, points: 2, maxPoints: 2 })
      })

      it('takes the last name pressed before the duration', () => {
        const { session } = quick()
        session.noteDrawn()
        session.answer(wrongLetter(session))
        session.answer(rightLetter(session))

        session.answerDuration(rightDuration(session))

        const state = inQuestion(session)
        expect(state.number).toBe(2)
        expect(state.score).toMatchObject({ checked: 1, points: 2, maxPoints: 2 })
      })

      it('takes the last duration pressed before the name', () => {
        const { session } = quick()
        session.noteDrawn()
        session.answerDuration(wrongDuration(session))
        session.answerDuration(rightDuration(session))

        session.answer(rightLetter(session))

        const state = inQuestion(session)
        expect(state.number).toBe(2)
        expect(state.score).toMatchObject({ checked: 1, points: 2, maxPoints: 2 })
      })

      it('times the answer from the drawn note to the press that completes it', () => {
        const { session, clock } = quick()
        session.noteDrawn()
        clock.elapse(1000)
        session.answer(rightLetter(session))
        clock.elapse(500)

        session.answerDuration(rightDuration(session))

        expect(inQuestion(session).score.totalTimeMs).toBe(1500)
      })

      it('opens the results at once when the last question is answered by its duration', () => {
        const { session } = quick()
        for (let number = 1; number < 10; number += 1) answerQuickRight(session)
        session.answer(rightLetter(session))

        session.answerDuration(rightDuration(session))

        expect(inResults(session).score).toMatchObject({ checked: 10, points: 20, maxPoints: 20 })
      })

      it('is ignored outside a question', () => {
        const { session } = setup()
        session.setAutoAdvance(true)

        session.answerDuration({ value: 'half' })

        expect(session.state).toEqual({ phase: 'choosing' })
      })

      describe('with the name right and the duration wrong', () => {
        function missedDuration() {
          const context = quick()
          context.session.noteDrawn()
          context.session.answer(rightLetter(context.session))
          context.session.answerDuration(wrongDuration(context.session))
          return context
        }

        it('stays on the question for the second attempt on the duration, the name kept', () => {
          const { session, source } = quick()
          session.noteDrawn()
          const right = rightLetter(session)
          const wrong = wrongDuration(session)
          session.answer(right)

          session.answerDuration(wrong)

          const state = inQuestion(session)
          expect(state.number).toBe(1)
          expect(source.served).toHaveLength(1)
          expect(state.trainer.firstGrade).toEqual({ pitch: true, duration: false })
          expect(state.trainer.wrongDuration).toEqual(wrong)
          expect(state.trainer.wrongChoice).toBeNull()
          expect(state.trainer.selected).toBe(right)
          expect(state.trainer.selectedDuration).toBeNull()
          expect(state.trainer.outcome).toBeNull()
          expect(state.trainer.hint).toBe(false)
          expect(state.score).toMatchObject({ checked: 1, points: 1, maxPoints: 2, streak: 0 })
        })

        it('stops the same way when the duration was pressed first', () => {
          const { session } = quick()
          session.noteDrawn()
          const wrong = wrongDuration(session)
          session.answerDuration(wrong)

          session.answer(rightLetter(session))

          const state = inQuestion(session)
          expect(state.number).toBe(1)
          expect(state.trainer.wrongDuration).toEqual(wrong)
          expect(state.trainer.selectedDuration).toBeNull()
          expect(state.trainer.outcome).toBeNull()
        })

        it('takes the second attempt by the duration alone: right opens the next question', () => {
          const { session } = missedDuration()

          session.answerDuration(rightDuration(session))

          const state = inQuestion(session)
          expect(state.number).toBe(2)
          expect(state.previousOutcome).toBe('correct-second-try')
          expect(state.score).toMatchObject({ checked: 1, points: 1, maxPoints: 2, streak: 0 })
        })

        it('takes the second attempt by the duration alone: wrong shows the review', () => {
          const { session } = missedDuration()
          const wrongAgain = anotherWrongDuration(session)

          session.answerDuration(wrongAgain)

          const state = inQuestion(session)
          expect(state.number).toBe(1)
          expect(state.trainer.outcome).toBe('incorrect')
          expect(state.trainer.selectedDuration).toEqual(wrongAgain)
          expect(state.score).toMatchObject({ checked: 1, points: 1, maxPoints: 2 })
        })

        it('ignores the wrong duration pressed again', () => {
          const { session } = missedDuration()

          session.answerDuration(wrongDuration(session))

          const state = inQuestion(session)
          expect(state.number).toBe(1)
          expect(state.trainer.outcome).toBeNull()
          expect(state.trainer.selectedDuration).toBeNull()
          expect(state.trainer.hint).toBe(false)
        })

        it('ignores a name pressed during the second attempt: the name is settled', () => {
          const { session } = missedDuration()
          const right = rightLetter(session)

          session.answer(wrongLetter(session))

          const state = inQuestion(session)
          expect(state.number).toBe(1)
          expect(state.trainer.selected).toBe(right)
          expect(state.trainer.outcome).toBeNull()
          expect(state.trainer.hint).toBe(false)
        })

        it('ignores a duration pressed on the review', () => {
          const { session } = missedDuration()
          session.answerDuration(anotherWrongDuration(session))

          session.answerDuration(rightDuration(session))

          const state = inQuestion(session)
          expect(state.number).toBe(1)
          expect(state.trainer.outcome).toBe('incorrect')
        })
      })

      describe('with the name wrong and the duration right', () => {
        it('stays on the question for the second attempt on the name, the duration kept', () => {
          const { session } = quick()
          session.noteDrawn()
          const wrong = wrongLetter(session)
          const duration = rightDuration(session)
          session.answer(wrong)

          session.answerDuration(duration)

          const state = inQuestion(session)
          expect(state.number).toBe(1)
          expect(state.trainer.wrongChoice).toBe(wrong)
          expect(state.trainer.selected).toBeNull()
          expect(state.trainer.selectedDuration).toEqual(duration)
          expect(state.trainer.outcome).toBeNull()
        })

        it('ignores a duration pressed during the second attempt: the duration is settled', () => {
          const { session } = quick()
          session.noteDrawn()
          const duration = rightDuration(session)
          session.answer(wrongLetter(session))
          session.answerDuration(duration)

          session.answerDuration(wrongDuration(session))

          const state = inQuestion(session)
          expect(state.trainer.selectedDuration).toEqual(duration)
          expect(state.trainer.outcome).toBeNull()
          expect(state.trainer.hint).toBe(false)
        })
      })

      describe('with both wrong', () => {
        function missedBoth() {
          const context = quick()
          context.session.noteDrawn()
          context.session.answer(wrongLetter(context.session))
          context.session.answerDuration(wrongDuration(context.session))
          return context
        }

        it('stays on the question with both rows cleared and both wrong choices kept out', () => {
          const { session } = missedBoth()

          const state = inQuestion(session)
          expect(state.number).toBe(1)
          expect(state.trainer.firstGrade).toEqual({ pitch: false, duration: false })
          expect(state.trainer.wrongChoice).toBe(wrongLetter(session))
          expect(state.trainer.wrongDuration).toEqual(wrongDuration(session))
          expect(state.trainer.selected).toBeNull()
          expect(state.trainer.selectedDuration).toBeNull()
          expect(state.score).toMatchObject({ checked: 1, points: 0, maxPoints: 2 })
        })

        it('does not grade the second attempt on one part alone', () => {
          const { session } = missedBoth()
          const right = rightLetter(session)

          session.answer(right)

          const state = inQuestion(session)
          expect(state.number).toBe(1)
          expect(state.trainer.selected).toBe(right)
          expect(state.trainer.outcome).toBeNull()
          expect(state.trainer.hint).toBe(false)
        })

        it('grades the second attempt once both are chosen again: right opens the next one', () => {
          const { session } = missedBoth()
          session.answerDuration(rightDuration(session))

          session.answer(rightLetter(session))

          const state = inQuestion(session)
          expect(state.number).toBe(2)
          expect(state.previousOutcome).toBe('correct-second-try')
          expect(state.score).toMatchObject({ checked: 1, points: 0, maxPoints: 2 })
        })

        it('grades the second attempt once both are chosen again: wrong shows the review', () => {
          const { session } = missedBoth()
          session.answer(rightLetter(session))

          session.answerDuration(anotherWrongDuration(session))

          const state = inQuestion(session)
          expect(state.number).toBe(1)
          expect(state.trainer.outcome).toBe('incorrect')
        })
      })

      describe('with "Show the right answer at once" on', () => {
        function quickAtOnce() {
          const context = setup()
          context.session.setShowAnswerAtOnce(true)
          context.session.setAutoAdvance(true)
          context.session.start(10)
          context.session.noteDrawn()
          return context
        }

        it('shows the review at once on a wrong duration pressed after the name', () => {
          const { session } = quickAtOnce()
          const wrong = wrongDuration(session)
          session.answer(rightLetter(session))

          session.answerDuration(wrong)

          const state = inQuestion(session)
          expect(state.number).toBe(1)
          expect(state.trainer.outcome).toBe('incorrect')
          expect(state.trainer.wrongDuration).toEqual(wrong)
          expect(state.score).toMatchObject({ checked: 1, points: 1, maxPoints: 2 })
        })

        it('moves on on next after the review, with no previous result', () => {
          const { session } = quickAtOnce()
          session.answer(rightLetter(session))
          session.answerDuration(wrongDuration(session))

          session.next()

          const state = inQuestion(session)
          expect(state.number).toBe(2)
          expect(state.previousOutcome).toBeNull()
        })
      })

      describe('turned off with one part chosen', () => {
        it('leaves the question clean: the name pressed alone is unselected', () => {
          const { session } = quick()
          session.noteDrawn()
          session.answer(rightLetter(session))

          session.setAutoAdvance(false)

          const state = inQuestion(session)
          expect(state.trainer.selected).toBeNull()
          expect(state.trainer.selectedDuration).toBeNull()
          expect(state.trainer.firstGrade).toBeNull()
          expect(state.trainer.hint).toBe(false)
        })
      })

      // Like turning it off, turning it on mid-question starts the choice over: a choice made
      // for Check is not taken as half of a quick answer.
      describe('turned on with a name chosen in the normal mode', () => {
        it('unselects the name, so a duration pressed then is only chosen', () => {
          const { session } = setup()
          session.start(10)
          session.noteDrawn()
          session.select(rightLetter(session))
          session.setAutoAdvance(true)

          session.answerDuration(rightDuration(session))

          const state = inQuestion(session)
          expect(state.number).toBe(1)
          expect(state.trainer.selected).toBeNull()
          expect(state.trainer.selectedDuration).toEqual(rightDuration(session))
          expect(state.trainer.firstGrade).toBeNull()
        })

        it('keeps the settled part during the second attempt', () => {
          const { session } = setup()
          session.start(10)
          session.noteDrawn()
          checkWrong(session)
          const duration = rightDuration(session)

          session.setAutoAdvance(true)

          expect(inQuestion(session).trainer.selectedDuration).toEqual(duration)
        })
      })
    })

    describe('score', () => {
      it('counts the answers like check and next do', () => {
        const { session } = quick()

        answerQuickRight(session)
        answerQuickRight(session)
        answerQuickWrong(session)
        answerQuickRight(session)

        expect(inQuestion(session).score).toMatchObject({
          checked: 4,
          points: 7,
          maxPoints: 8,
          streak: 1,
          bestStreak: 2,
        })
      })

      it('gives the same score as check and next for the same answers', () => {
        const fast = quick()
        const slow = setup()
        slow.session.start(10)

        for (const right of [true, false, true, true, false]) {
          if (right) {
            answerQuickRight(fast.session)
            answerRight(slow.session)
          } else {
            answerQuickWrong(fast.session)
            answerWrong(slow.session)
          }
          slow.session.next()
        }

        const fastState = inQuestion(fast.session)
        const slowState = inQuestion(slow.session)
        expect(fastState.number).toBe(slowState.number)
        expect(fastState.score).toEqual(slowState.score)
      })
    })

    describe('the hint', () => {
      it('never appears: check without a name does nothing', () => {
        const { session } = quick()

        session.check()

        const state = inQuestion(session)
        expect(state.trainer.hint).toBe(false)
        expect(state.number).toBe(1)
        expect(state.score.checked).toBe(0)
      })
    })

    describe('last question of a fixed session', () => {
      it.each<10 | 20 | 50>([10, 20, 50])(
        'opens the results at once when question %i is answered right',
        (length) => {
          const { session } = quick(length)
          for (let number = 1; number < length; number += 1) answerQuickRight(session)
          expect(inQuestion(session).isLast).toBe(true)

          answerQuickRight(session)

          expect(inResults(session).score).toMatchObject({
            checked: length,
            points: length * 2,
            maxPoints: length * 2,
            streak: length,
            bestStreak: length,
          })
        },
      )

      it('opens the results at once when the last question is right on the second try', () => {
        const { session } = quick()
        for (let number = 1; number < 10; number += 1) answerQuickRight(session)

        answerQuickRightOnSecondTry(session)

        expect(inResults(session).score).toMatchObject({
          checked: 10,
          points: 19,
          maxPoints: 20,
          streak: 0,
          bestStreak: 9,
        })
      })

      it('stays on the review of the last question, then leads to the results on next', () => {
        const { session } = quick()
        for (let number = 1; number < 10; number += 1) answerQuickRight(session)
        missQuick(session)
        session.answer(anotherWrongLetter(session))

        const state = inQuestion(session)
        expect(state.number).toBe(10)
        expect(state.isLast).toBe(true)
        expect(state.trainer.outcome).toBe('incorrect')

        session.next()

        expect(inResults(session).score).toMatchObject({ checked: 10, points: 19, maxPoints: 20 })
      })
    })

    describe('without a limit', () => {
      it('keeps moving on past 50 questions', () => {
        const { session } = quick('unlimited')

        for (let number = 1; number <= 55; number += 1) answerQuickRight(session)

        const state = inQuestion(session)
        expect(state.number).toBe(56)
        expect(state.isLast).toBe(false)
        expect(state.score).toMatchObject({ checked: 55, points: 110, maxPoints: 110 })
      })
    })

    describe('answer time', () => {
      it('runs from the note being drawn to the pressed name', () => {
        const { session, clock } = quick()
        clock.elapse(700)
        session.noteDrawn()
        clock.elapse(2400)
        session.selectDuration(rightDuration(session))

        session.answer(rightLetter(session))

        expect(inQuestion(session).score.totalTimeMs).toBe(2400)
      })

      it('times each question from its own note', () => {
        const { session, clock } = quick()
        session.noteDrawn()
        clock.elapse(2000)
        session.selectDuration(rightDuration(session))
        session.answer(rightLetter(session))
        clock.elapse(300)
        session.noteDrawn()
        clock.elapse(1000)
        session.selectDuration(rightDuration(session))

        session.answer(wrongLetter(session))

        const { score } = inQuestion(session)
        expect(score.totalTimeMs).toBe(3000)
        expect(averageTimeMs(score)).toBe(1500)
      })

      it('includes the last answer in the results', () => {
        const { session, clock } = quick()
        for (let number = 1; number <= 10; number += 1) {
          session.noteDrawn()
          clock.elapse(number * 200)
          session.selectDuration(rightDuration(session))
          session.answer(rightLetter(session))
        }

        // 200 + 400 + ... + 2000 = 11000 over 10 questions
        expect(averageTimeMs(inResults(session).score)).toBe(1100)
      })
    })

    describe('turned on while the result is shown', () => {
      function resultShownOn(number: number) {
        const context = setup()
        context.session.start(10)
        goToQuestion(context.session, number)
        answerWrong(context.session)
        return context
      }

      it('opens the next question at once', () => {
        const { session, source } = resultShownOn(3)

        session.setAutoAdvance(true)

        const state = inQuestion(session)
        expect(state.number).toBe(4)
        expect(state.trainer.question).toBe(source.served[3])
        expect(state.trainer.outcome).toBeNull()
      })

      it('keeps the shown result as the previous one', () => {
        const { session } = resultShownOn(3)

        session.setAutoAdvance(true)

        expect(inQuestion(session).previousOutcome).toBe('incorrect')
      })

      it('keeps a result right on the second try as the previous one', () => {
        const { session } = setup()
        session.start(10)
        answerRightOnSecondTry(session)

        session.setAutoAdvance(true)

        const state = inQuestion(session)
        expect(state.number).toBe(2)
        expect(state.previousOutcome).toBe('correct-second-try')
      })

      it('does not count the shown result again', () => {
        const { session } = resultShownOn(3)

        session.setAutoAdvance(true)

        expect(inQuestion(session).score).toMatchObject({ checked: 3, points: 5, maxPoints: 6 })
      })

      it('opens the results at once after the last question', () => {
        const { session } = resultShownOn(10)

        session.setAutoAdvance(true)

        expect(inResults(session).score).toMatchObject({ checked: 10, points: 19, maxPoints: 20 })
      })

      it('hides the hint that was shown', () => {
        const { session } = setup()
        session.start(10)
        session.check()

        session.setAutoAdvance(true)

        const state = inQuestion(session)
        expect(state.trainer.hint).toBe(false)
        expect(state.number).toBe(1)
        expect(state.score.checked).toBe(0)
      })

      it('leaves an unanswered question as it is', () => {
        const { session } = setup()
        session.start(10)
        session.select('G')

        session.setAutoAdvance(true)

        const state = inQuestion(session)
        expect(state.number).toBe(1)
        expect(state.trainer.firstGrade).toBeNull()
        expect(state.previousOutcome).toBeNull()
      })
    })

    // Criterion 8: the question goes on in the normal mode, in a clean state.
    describe('turned off during a question', () => {
      function afterQuickAnswers() {
        const context = quick()
        answerQuickRight(context.session)
        answerQuickRightOnSecondTry(context.session)
        return context
      }

      it('drops the previous result', () => {
        const { session } = afterQuickAnswers()

        session.setAutoAdvance(false)

        expect(inQuestion(session).previousOutcome).toBeNull()
      })

      it('stays on the same question with the same score', () => {
        const { session, source } = afterQuickAnswers()

        session.setAutoAdvance(false)

        const state = inQuestion(session)
        expect(state.number).toBe(3)
        expect(state.trainer.question).toBe(source.served[2])
        expect(state.score).toMatchObject({
          checked: 2,
          points: 3,
          maxPoints: 4,
          streak: 0,
          bestStreak: 1,
        })
      })

      it('leaves the question clean: nothing chosen, no result, no hint', () => {
        const { session } = afterQuickAnswers()

        session.setAutoAdvance(false)

        const { trainer } = inQuestion(session)
        expect(trainer.selected).toBeNull()
        expect(trainer.firstGrade).toBeNull()
        expect(trainer.outcome).toBeNull()
        expect(trainer.wrongChoice).toBeNull()
        expect(trainer.hint).toBe(false)
      })

      it('does not bring back the hint shown before the mode was turned on', () => {
        const { session } = setup()
        session.start(10)
        session.check()
        session.setAutoAdvance(true)

        session.setAutoAdvance(false)

        const state = inQuestion(session)
        expect(state.trainer.hint).toBe(false)
        expect(state.trainer.selected).toBeNull()
        expect(state.trainer.firstGrade).toBeNull()
        expect(state.previousOutcome).toBeNull()
        expect(state.number).toBe(1)
        expect(state.score.checked).toBe(0)
      })

      it('unselects a name and a duration chosen before the mode was turned on', () => {
        const { session } = setup()
        session.start(10)
        session.select('G')
        session.selectDuration({ value: 'quarter' })
        session.setAutoAdvance(true)

        session.setAutoAdvance(false)

        const state = inQuestion(session)
        expect(state.trainer.selected).toBeNull()
        expect(state.trainer.selectedDuration).toBeNull()
        expect(state.trainer.firstGrade).toBeNull()
        expect(state.number).toBe(1)
      })

      it('goes on in the normal mode: check grades and stays on the question', () => {
        const { session } = afterQuickAnswers()
        session.setAutoAdvance(false)

        checkRight(session)

        const state = inQuestion(session)
        expect(state.number).toBe(3)
        expect(state.trainer.outcome).toBe('correct')
        expect(state.previousOutcome).toBeNull()
        expect(state.score).toMatchObject({ checked: 3, points: 5, maxPoints: 6, streak: 1 })
      })

      it('shows the hint again on check without a name', () => {
        const { session } = setup()
        session.start(10)
        session.check()
        session.setAutoAdvance(true)
        session.setAutoAdvance(false)

        session.check()

        expect(inQuestion(session).trainer.hint).toBe(true)
      })

      it('ignores the one-tap answer', () => {
        const { session } = afterQuickAnswers()
        session.setAutoAdvance(false)

        session.answer(rightLetter(session))

        const state = inQuestion(session)
        expect(state.number).toBe(3)
        expect(state.score.checked).toBe(2)
      })

      it('opens the next question on next without a previous result', () => {
        const { session } = afterQuickAnswers()
        session.setAutoAdvance(false)
        checkWrong(session)
        checkWrongAgain(session)

        session.next()

        const state = inQuestion(session)
        expect(state.number).toBe(4)
        expect(state.previousOutcome).toBeNull()
        expect(state.trainer.outcome).toBeNull()
      })

      it('keeps timing the shown question from its note', () => {
        const { session, clock } = afterQuickAnswers()
        const before = inQuestion(session).score.totalTimeMs
        session.noteDrawn()
        clock.elapse(1000)
        session.setAutoAdvance(false)
        clock.elapse(500)

        checkRight(session)

        expect(inQuestion(session).score.totalTimeMs - before).toBe(1500)
      })
    })

    // Feature mistake-review, criterion 6 of slice 3: the second attempt is not skipped.
    describe('turned on during the second attempt', () => {
      function inSecondAttempt() {
        const context = setup()
        context.session.start(10)
        context.session.noteDrawn()
        checkWrong(context.session)
        return context
      }

      it('stays on the question, the wrong name kept out', () => {
        const { session, source } = inSecondAttempt()
        const { wrongChoice } = inQuestion(session).trainer

        session.setAutoAdvance(true)

        const state = inQuestion(session)
        expect(state.number).toBe(1)
        expect(source.served).toHaveLength(1)
        expect(state.trainer.wrongChoice).toBe(wrongChoice)
        expect(state.trainer.outcome).toBeNull()
        expect(state.score).toMatchObject({ checked: 1, points: 1, maxPoints: 2 })
      })

      it('takes the second attempt by a pressed name: right opens the next question', () => {
        const { session } = inSecondAttempt()
        session.setAutoAdvance(true)

        session.answer(rightLetter(session))

        const state = inQuestion(session)
        expect(state.number).toBe(2)
        expect(state.previousOutcome).toBe('correct-second-try')
        expect(state.score).toMatchObject({ checked: 1, points: 1, maxPoints: 2 })
      })

      it('takes the second attempt by a pressed name: wrong shows the review', () => {
        const { session } = inSecondAttempt()
        session.setAutoAdvance(true)

        session.answer(anotherWrongLetter(session))

        const state = inQuestion(session)
        expect(state.number).toBe(1)
        expect(state.trainer.outcome).toBe('incorrect')
      })
    })

    // Feature mistake-review, edge case 3: the second attempt goes on in the normal mode.
    describe('turned off during the second attempt', () => {
      function inQuickSecondAttempt() {
        const context = quick()
        answerQuickRight(context.session)
        missQuick(context.session)
        return context
      }

      it('stays on the question, the wrong name kept out and the first attempt counted', () => {
        const { session } = inQuickSecondAttempt()
        const { wrongChoice } = inQuestion(session).trainer

        session.setAutoAdvance(false)

        const state = inQuestion(session)
        expect(state.number).toBe(2)
        expect(state.trainer.wrongChoice).toBe(wrongChoice)
        expect(state.trainer.firstGrade).toEqual({ pitch: false, duration: true })
        expect(state.trainer.outcome).toBeNull()
        expect(state.trainer.selected).toBeNull()
        expect(state.score).toMatchObject({ checked: 2, points: 3, maxPoints: 4 })
      })

      it('takes the second attempt by check: right ends it on the question', () => {
        const { session } = inQuickSecondAttempt()
        session.setAutoAdvance(false)

        checkRight(session)

        const state = inQuestion(session)
        expect(state.number).toBe(2)
        expect(state.trainer.outcome).toBe('correct-second-try')
        expect(state.score).toMatchObject({ checked: 2, points: 3, maxPoints: 4, streak: 0 })
      })

      it('takes the second attempt by check: wrong shows the review', () => {
        const { session } = inQuickSecondAttempt()
        session.setAutoAdvance(false)

        checkWrongAgain(session)

        const state = inQuestion(session)
        expect(state.number).toBe(2)
        expect(state.trainer.outcome).toBe('incorrect')
      })

      it('ignores the one-tap answer', () => {
        const { session } = inQuickSecondAttempt()
        session.setAutoAdvance(false)

        session.answer(rightLetter(session))

        const state = inQuestion(session)
        expect(state.number).toBe(2)
        expect(state.trainer.outcome).toBeNull()
      })
    })

    describe('turned off on the review of the quick mode', () => {
      it('keeps the review, and next moves on', () => {
        const { session } = quick()
        missQuick(session)
        session.answer(anotherWrongLetter(session))

        session.setAutoAdvance(false)
        expect(inQuestion(session).trainer.outcome).toBe('incorrect')
        expect(inQuestion(session).number).toBe(1)

        session.next()
        expect(inQuestion(session).number).toBe(2)
      })
    })

    // Criterion 2 of the slice: in the quick mode a result never stays on its own question.
    describe('turned off while already off on a shown result', () => {
      it('keeps the result and the question', () => {
        const { session } = setup()
        session.start(10)
        answerWrong(session)

        session.setAutoAdvance(false)

        const state = inQuestion(session)
        expect(state.number).toBe(1)
        expect(state.trainer.outcome).toBe('incorrect')
        expect(state.previousOutcome).toBeNull()
      })
    })

    describe('finish', () => {
      it('opens the results with the answered questions', () => {
        const { session } = quick()
        answerQuickRight(session)
        answerQuickWrong(session)
        answerQuickRight(session)

        session.finish()

        expect(inResults(session).score).toMatchObject({
          checked: 3,
          points: 5,
          maxPoints: 6,
          bestStreak: 1,
        })
      })

      it('leaves out the time of the shown question', () => {
        const { session, clock } = quick()
        session.noteDrawn()
        clock.elapse(2000)
        session.selectDuration(rightDuration(session))
        session.answer(rightLetter(session))
        session.noteDrawn()
        clock.elapse(9000)

        session.finish()

        expect(inResults(session).score.totalTimeMs).toBe(2000)
      })

      it('returns to the length choice when nothing was answered', () => {
        const { session } = quick()

        session.finish()

        expect(session.state).toEqual({ phase: 'choosing' })
      })

      it('keeps the quick mode on', () => {
        const { session } = quick()
        answerQuickRight(session)

        session.finish()

        expect(session.autoAdvance).toBe(true)
      })
    })
  })

  // Feature language-and-naming, criterion 8: the preferences remember both modes.
  describe('modes remembered from an earlier page load', () => {
    it('are both off when nothing was remembered', () => {
      const { session } = setup()

      expect(session.autoAdvance).toBe(false)
      expect(session.showAnswerAtOnce).toBe(false)
    })

    it('start the quick mode from the first question', () => {
      const { session } = setup({ autoAdvance: true })
      expect(session.autoAdvance).toBe(true)
      session.start(10)

      answerQuickRight(session)

      expect(inQuestion(session).number).toBe(2)
    })

    it('ignore check while the remembered quick mode is on', () => {
      const { session } = setup({ autoAdvance: true })
      session.start(10)
      session.noteDrawn()

      checkRight(session)

      expect(inQuestion(session).trainer.outcome).toBeNull()
    })

    it('show the right answer at once from the first question', () => {
      const { session } = setup({ showAnswerAtOnce: true })
      expect(session.showAnswerAtOnce).toBe(true)
      session.start(10)
      session.noteDrawn()

      checkWrong(session)

      expect(inQuestion(session).trainer.outcome).toBe('incorrect')
    })

    it('give the second attempt again once the answer at once is turned off', () => {
      const { session } = setup({ showAnswerAtOnce: true })
      session.setShowAnswerAtOnce(false)
      session.start(10)
      session.noteDrawn()

      checkWrong(session)

      expect(inQuestion(session).trainer.outcome).toBeNull()
      expect(inQuestion(session).trainer.wrongChoice).not.toBeNull()
    })
  })

  describe('changing a mode', () => {
    it.each([true, false])('remembers the quick mode turned to %s', (on) => {
      const { session, modes } = setup({ autoAdvance: !on })

      session.setAutoAdvance(on)

      expect(modes.preferences.autoAdvance).toBe(on)
      expect(session.autoAdvance).toBe(on)
    })

    it('remembers the quick mode changed during a question', () => {
      const { session, modes } = setup()
      session.start(10)

      session.setAutoAdvance(true)

      expect(modes.preferences.autoAdvance).toBe(true)
    })

    it.each([true, false])('remembers the answer at once turned to %s', (on) => {
      const { session, modes } = setup({ showAnswerAtOnce: !on })

      session.setShowAnswerAtOnce(on)

      expect(modes.preferences.showAnswerAtOnce).toBe(on)
      expect(session.showAnswerAtOnce).toBe(on)
    })

    it('leaves the other mode as it was', () => {
      const { session, modes } = setup()

      session.setShowAnswerAtOnce(true)

      expect(modes.changes).toEqual(['showAnswerAtOnce true'])
      expect(session.autoAdvance).toBe(false)
    })

    it('remembers nothing while the modes are not changed', () => {
      const { session, modes } = setup({ autoAdvance: true, showAnswerAtOnce: true })

      session.start(10)
      answerQuickRight(session)
      session.finish()
      session.newSession()

      expect(modes.changes).toEqual([])
    })

    it('carries the changed modes over to a session of the next page load', () => {
      const first = setup()
      first.session.setAutoAdvance(true)
      first.session.setShowAnswerAtOnce(true)

      const next = createSession(
        questionSource().questionsFor,
        fakeClock().clock,
        first.modes.preferences,
      )

      expect(next.autoAdvance).toBe(true)
      expect(next.showAnswerAtOnce).toBe(true)
    })
  })

  // Feature difficulty-presets, criterion 2: the next session goes with the chosen preset.
  describe('the difficulty', () => {
    it('is not asked for before a session starts', () => {
      const { source } = setup()

      expect(source.difficulties).toEqual([])
    })

    it('is taken from the preferences when the session starts', () => {
      const { session, source } = setup({ difficulty: FIRST_STEPS })

      session.start(10)

      expect(source.difficulties).toEqual([FIRST_STEPS])
    })

    it('is taken anew for the next session', () => {
      const { session, source, modes } = setup()
      session.start(10)
      answerRight(session)
      session.finish()
      session.newSession()

      modes.preferences.difficulty = FIRST_STEPS
      session.start(10)

      expect(source.difficulties).toEqual([CONFIDENT_READING, FIRST_STEPS])
      expect(inQuestion(session).trainer.askDuration).toBe(false)
    })

    it('stays the same for every question of a session', () => {
      const { session, source } = setup()
      session.start(10)

      goToQuestion(session, 4)

      expect(source.difficulties).toEqual([CONFIDENT_READING])
      expect(source.served).toHaveLength(4)
    })
  })

  // Feature difficulty-presets, criterion 5: only the name is checked, a note is worth a point.
  describe('without the duration asked', () => {
    function firstSteps(remembered: Partial<Modes> = {}) {
      const result = setup({ difficulty: FIRST_STEPS, ...remembered })
      result.session.start(10)
      result.session.noteDrawn()
      return result
    }

    function nameRight(session: Session) {
      session.select(rightLetter(session))
      session.check()
    }

    function nameWrongTwice(session: Session) {
      session.select(wrongLetter(session))
      session.check()
      session.select(anotherWrongLetter(session))
      session.check()
    }

    it('says so in the question state', () => {
      const { session } = firstSteps()

      expect(inQuestion(session).trainer.askDuration).toBe(false)
    })

    it('checks the name alone and gives the one point of the note', () => {
      const { session } = firstSteps()

      nameRight(session)

      expect(inQuestion(session).trainer.outcome).toBe('correct')
      expect(inQuestion(session).score).toMatchObject({ checked: 1, points: 1, maxPoints: 1 })
    })

    it('shows the hint on Check without a name', () => {
      const { session } = firstSteps()

      session.check()

      expect(inQuestion(session).trainer.hint).toBe(true)
      expect(inQuestion(session).score.checked).toBe(0)
    })

    it('counts 3 of 4 points for three right names out of four', () => {
      const { session } = firstSteps()
      nameRight(session)
      session.next()
      session.noteDrawn()
      nameWrongTwice(session)
      session.next()
      session.noteDrawn()
      nameRight(session)
      session.next()
      session.noteDrawn()
      nameRight(session)

      session.finish()

      expect(inResults(session).score).toMatchObject({ checked: 4, points: 3, maxPoints: 4 })
    })

    describe('in the quick mode', () => {
      it('answers with a name alone and opens the next question', () => {
        const { session } = firstSteps({ autoAdvance: true })

        session.answer(rightLetter(session))

        expect(inQuestion(session).number).toBe(2)
        expect(inQuestion(session).previousOutcome).toBe('correct')
        expect(inQuestion(session).score).toMatchObject({ points: 1, maxPoints: 1 })
      })

      it('stays on the question for the second attempt after a wrong name', () => {
        const { session } = firstSteps({ autoAdvance: true })
        const wrong = wrongLetter(session)

        session.answer(wrong)

        expect(inQuestion(session).number).toBe(1)
        expect(inQuestion(session).trainer.wrongChoice).toBe(wrong)
        expect(inQuestion(session).score).toMatchObject({ points: 0, maxPoints: 1 })
      })

      it('opens the next question on the right name in the second attempt', () => {
        const { session } = firstSteps({ autoAdvance: true })
        session.answer(wrongLetter(session))

        session.answer(rightLetter(session))

        expect(inQuestion(session).number).toBe(2)
        expect(inQuestion(session).previousOutcome).toBe('correct-second-try')
      })

      it('ignores a duration', () => {
        const { session } = firstSteps({ autoAdvance: true })
        const before = inQuestion(session)

        session.answerDuration(rightDuration(session))

        expect(inQuestion(session)).toEqual(before)
      })
    })
  })
})
