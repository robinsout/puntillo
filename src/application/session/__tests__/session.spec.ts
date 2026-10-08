import { describe, expect, it } from 'vitest'
import type { Clock } from '@/application/ports'
import { createSession } from '@/application/session'
import type { Session, SessionState } from '@/application/session'
import { LETTERS } from '@/domain/pitch'
import type { Letter } from '@/domain/pitch'
import type { Question } from '@/domain/question'
import { createQuestion } from '@/domain/question'
import { averageTimeMs } from '@/domain/session'
import type { SessionLength } from '@/domain/session'

function questionSource() {
  const served: Question[] = []
  const next = () => {
    const letter = LETTERS[served.length % LETTERS.length] ?? 'C'
    const question = createQuestion({ pitch: { letter, octave: 4 }, duration: { value: 'whole' } })
    served.push(question)
    return question
  }
  return { next, served }
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

function setup() {
  const source = questionSource()
  const time = fakeClock()
  const session = createSession(source.next, time.clock)
  return { session, source, clock: time }
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
  session.check()
}

function checkWrong(session: Session) {
  session.select(wrongLetter(session))
  session.check()
}

function checkWrongAgain(session: Session) {
  session.select(anotherWrongLetter(session))
  session.check()
}

function answerQuickRight(session: Session) {
  session.noteDrawn()
  session.answer(rightLetter(session))
}

// Only the first press, wrong: the quick mode stops on the question for the second attempt.
function missQuick(session: Session) {
  session.noteDrawn()
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
        correct: 0,
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

      expect(inResults(session).score).toMatchObject({ checked: 10, correct: 9 })
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
    it('counts a correct check as checked and correct', () => {
      const { session } = setup()
      session.start(10)

      answerRight(session)

      expect(inQuestion(session).score).toMatchObject({ checked: 1, correct: 1 })
    })

    it('counts a wrong check as checked only', () => {
      const { session } = setup()
      session.start(10)

      answerWrong(session)

      expect(inQuestion(session).score).toMatchObject({ checked: 1, correct: 0 })
    })

    it('counts a wrong first attempt at once, before the second one', () => {
      const { session } = setup()
      session.start(10)
      session.noteDrawn()

      checkWrong(session)

      expect(inQuestion(session).score).toMatchObject({ checked: 1, correct: 0 })
    })

    it('counts a question right on the second try as incorrect, once', () => {
      const { session } = setup()
      session.start(10)

      answerRightOnSecondTry(session)

      expect(inQuestion(session).score).toMatchObject({ checked: 1, correct: 0 })
    })

    it('counts a question wrong on both attempts once', () => {
      const { session } = setup()
      session.start(10)

      answerWrong(session)

      expect(inQuestion(session).score).toMatchObject({ checked: 1, correct: 0 })
    })

    it('does not count the hint', () => {
      const { session } = setup()
      session.start(10)

      session.check()

      expect(inQuestion(session).score).toMatchObject({ checked: 0, correct: 0 })
    })

    it('does not count the same question twice when check is pressed again', () => {
      const { session } = setup()
      session.start(10)

      answerRight(session)
      session.check()

      expect(inQuestion(session).score).toMatchObject({ checked: 1, correct: 1 })
    })

    it('adds up over several questions', () => {
      const { session } = setup()
      session.start(10)

      answerRight(session)
      session.next()
      answerWrong(session)
      session.next()
      answerRight(session)

      expect(inQuestion(session).score).toMatchObject({ checked: 3, correct: 2 })
    })
  })

  describe('streak', () => {
    it('grows with each correct check in a row', () => {
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

      expect(inQuestion(session).score).toMatchObject({ checked: 2, correct: 2, streak: 2 })
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

      expect(inResults(session).score).toMatchObject({ checked: 10, correct: 9 })
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

      expect(inResults(session).score).toMatchObject({ checked: 10, correct: 8 })
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
        correct: 3,
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

      expect(inResults(session).score).toMatchObject({ checked: 1, correct: 1, bestStreak: 1 })
    })

    it('leaves out the shown question that only got the hint', () => {
      const { session } = setup()
      session.start(10)
      answerRight(session)
      session.next()
      session.check()

      session.finish()

      expect(inResults(session).score).toMatchObject({ checked: 1, correct: 1 })
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
        correct: 1,
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

      expect(inResults(session).score).toMatchObject({ checked: 1, correct: 0 })
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

      expect(inResults(session).score).toMatchObject({ checked: 53, correct: 52, bestStreak: 52 })
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
        correct: 0,
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

      expect(inResults(session).score).toMatchObject({ checked: 10, correct: 9 })
    })

    it('counts the wrong answer once, like a wrong first attempt', () => {
      const { session } = atOnce()
      answerRight(session)
      session.next()

      answerWrongOnce(session)
      session.check()

      expect(inQuestion(session).score).toMatchObject({
        checked: 2,
        correct: 1,
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
        expect(state.score).toMatchObject({ checked: 1, correct: 0 })
      })

      it('ignores a name pressed on the review', () => {
        const { session } = quickAtOnce()
        missQuick(session)

        session.answer(rightLetter(session))

        const state = inQuestion(session)
        expect(state.number).toBe(1)
        expect(state.trainer.outcome).toBe('incorrect')
        expect(state.score).toMatchObject({ checked: 1, correct: 0 })
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

        expect(inResults(session).score).toMatchObject({ checked: 10, correct: 9 })
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

        expect(inQuestion(session).score).toMatchObject({ checked: 1, correct: 1 })
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

        expect(inQuestion(session).score).toMatchObject({ checked: 2, correct: 1, streak: 0 })
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
          correct: 1,
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
        expect(state.score).toMatchObject({ checked: 1, correct: 0 })
      })

      it('ignores a name pressed on the review', () => {
        const { session } = quick()
        missQuick(session)
        session.answer(anotherWrongLetter(session))

        session.answer(rightLetter(session))

        const state = inQuestion(session)
        expect(state.number).toBe(1)
        expect(state.trainer.outcome).toBe('incorrect')
        expect(state.score).toMatchObject({ checked: 1, correct: 0 })
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
        expect(state.score).toMatchObject({ checked: 1, correct: 0 })
      })

      it('times the answer to the first press only', () => {
        const { session, clock } = quick()
        session.noteDrawn()
        clock.elapse(1000)
        session.answer(wrongLetter(session))
        clock.elapse(4000)

        session.answer(rightLetter(session))

        expect(inQuestion(session).score.totalTimeMs).toBe(1000)
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
          correct: 3,
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
            correct: length,
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
          correct: 9,
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

        expect(inResults(session).score).toMatchObject({ checked: 10, correct: 9 })
      })
    })

    describe('without a limit', () => {
      it('keeps moving on past 50 questions', () => {
        const { session } = quick('unlimited')

        for (let number = 1; number <= 55; number += 1) answerQuickRight(session)

        const state = inQuestion(session)
        expect(state.number).toBe(56)
        expect(state.isLast).toBe(false)
        expect(state.score).toMatchObject({ checked: 55, correct: 55 })
      })
    })

    describe('answer time', () => {
      it('runs from the note being drawn to the pressed name', () => {
        const { session, clock } = quick()
        clock.elapse(700)
        session.noteDrawn()
        clock.elapse(2400)

        session.answer(rightLetter(session))

        expect(inQuestion(session).score.totalTimeMs).toBe(2400)
      })

      it('times each question from its own note', () => {
        const { session, clock } = quick()
        session.noteDrawn()
        clock.elapse(2000)
        session.answer(rightLetter(session))
        clock.elapse(300)
        session.noteDrawn()
        clock.elapse(1000)

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

        expect(inQuestion(session).score).toMatchObject({ checked: 3, correct: 2 })
      })

      it('opens the results at once after the last question', () => {
        const { session } = resultShownOn(10)

        session.setAutoAdvance(true)

        expect(inResults(session).score).toMatchObject({ checked: 10, correct: 9 })
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
        expect(state.score).toMatchObject({ checked: 2, correct: 1, streak: 0, bestStreak: 1 })
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

      it('unselects a name chosen before the mode was turned on', () => {
        const { session } = setup()
        session.start(10)
        session.select('G')
        session.setAutoAdvance(true)

        session.setAutoAdvance(false)

        const state = inQuestion(session)
        expect(state.trainer.selected).toBeNull()
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
        expect(state.score).toMatchObject({ checked: 3, correct: 2, streak: 1 })
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
        expect(state.score).toMatchObject({ checked: 1, correct: 0 })
      })

      it('takes the second attempt by a pressed name: right opens the next question', () => {
        const { session } = inSecondAttempt()
        session.setAutoAdvance(true)

        session.answer(rightLetter(session))

        const state = inQuestion(session)
        expect(state.number).toBe(2)
        expect(state.previousOutcome).toBe('correct-second-try')
        expect(state.score).toMatchObject({ checked: 1, correct: 0 })
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
        expect(state.trainer.firstGrade).toEqual({ correct: false })
        expect(state.trainer.outcome).toBeNull()
        expect(state.trainer.selected).toBeNull()
        expect(state.score).toMatchObject({ checked: 2, correct: 1 })
      })

      it('takes the second attempt by check: right ends it on the question', () => {
        const { session } = inQuickSecondAttempt()
        session.setAutoAdvance(false)

        checkRight(session)

        const state = inQuestion(session)
        expect(state.number).toBe(2)
        expect(state.trainer.outcome).toBe('correct-second-try')
        expect(state.score).toMatchObject({ checked: 2, correct: 1, streak: 0 })
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

        expect(inResults(session).score).toMatchObject({ checked: 3, correct: 2, bestStreak: 1 })
      })

      it('leaves out the time of the shown question', () => {
        const { session, clock } = quick()
        session.noteDrawn()
        clock.elapse(2000)
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
})
