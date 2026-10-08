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

// The scene draws the note before the names can be pressed, so a whole answer starts there.
function answerRight(session: Session) {
  session.noteDrawn()
  checkRight(session)
}

function answerWrong(session: Session) {
  session.noteDrawn()
  checkWrong(session)
}

function checkRight(session: Session) {
  session.select(rightLetter(session))
  session.check()
}

function checkWrong(session: Session) {
  session.select(wrongLetter(session))
  session.check()
}

function answerQuickRight(session: Session) {
  session.noteDrawn()
  session.answer(rightLetter(session))
}

function answerQuickWrong(session: Session) {
  session.noteDrawn()
  session.answer(wrongLetter(session))
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
      expect(trainer.grade).toBeNull()
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

      answerWrong(session)

      expect(inQuestion(session).trainer.grade).toEqual({ correct: false })
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
      expect(state.trainer.grade).toBeNull()
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
      expect(state.trainer.grade).toEqual({ correct: false })
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
      expect(state.trainer.grade).toBeNull()
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
      expect(state.trainer.grade).toEqual({ correct: true })
    })
  })

  describe('with the quick mode off', () => {
    it('has no previous result on the first question', () => {
      const { session } = setup()

      session.start(10)

      expect(inQuestion(session).previousGrade).toBeNull()
    })

    it('shows the result on the question itself, not as the previous one', () => {
      const { session } = setup()
      session.start(10)

      answerWrong(session)

      const state = inQuestion(session)
      expect(state.trainer.grade).toEqual({ correct: false })
      expect(state.previousGrade).toBeNull()
    })

    it('opens the next question without a previous result', () => {
      const { session } = setup()
      session.start(10)

      answerRight(session)
      session.next()

      expect(inQuestion(session).previousGrade).toBeNull()
    })

    it('ignores the one-tap answer', () => {
      const { session } = setup()
      session.start(10)
      session.noteDrawn()

      session.answer(rightLetter(session))

      const state = inQuestion(session)
      expect(state.number).toBe(1)
      expect(state.trainer.grade).toBeNull()
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
        expect(state.trainer.grade).toBeNull()
        expect(state.trainer.hint).toBe(false)
      })

      it('moves on after a wrong answer too', () => {
        const { session } = quick()

        answerQuickWrong(session)

        expect(inQuestion(session).number).toBe(2)
      })

      it('shows a correct answer as the previous result', () => {
        const { session } = quick()

        answerQuickRight(session)

        expect(inQuestion(session).previousGrade).toEqual({ correct: true })
      })

      it('shows a wrong answer as the previous result', () => {
        const { session } = quick()

        answerQuickWrong(session)

        expect(inQuestion(session).previousGrade).toEqual({ correct: false })
      })

      it('keeps the previous result while the new question is not answered', () => {
        const { session, clock } = quick()
        answerQuickWrong(session)

        session.noteDrawn()
        clock.elapse(5000)

        expect(inQuestion(session).previousGrade).toEqual({ correct: false })
      })

      it('replaces the previous result with the next answer', () => {
        const { session } = quick()
        answerQuickWrong(session)

        answerQuickRight(session)

        const state = inQuestion(session)
        expect(state.number).toBe(3)
        expect(state.previousGrade).toEqual({ correct: true })
      })

      it('has no previous result on the first question', () => {
        const { session } = quick()

        expect(inQuestion(session).previousGrade).toBeNull()
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
        'opens the results at once when question %i is answered',
        (length) => {
          const { session } = quick(length)
          for (let number = 1; number < length; number += 1) answerQuickRight(session)
          expect(inQuestion(session).isLast).toBe(true)

          answerQuickWrong(session)

          expect(inResults(session).score).toMatchObject({
            checked: length,
            correct: length - 1,
            streak: 0,
            bestStreak: length - 1,
          })
        },
      )
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
        expect(state.trainer.grade).toBeNull()
      })

      it('keeps the shown result as the previous one', () => {
        const { session } = resultShownOn(3)

        session.setAutoAdvance(true)

        expect(inQuestion(session).previousGrade).toEqual({ correct: false })
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
        expect(state.trainer.grade).toBeNull()
        expect(state.previousGrade).toBeNull()
      })
    })

    // Criterion 8: the question goes on in the normal mode, in a clean state.
    describe('turned off during a question', () => {
      function afterQuickAnswers() {
        const context = quick()
        answerQuickRight(context.session)
        answerQuickWrong(context.session)
        return context
      }

      it('drops the previous result', () => {
        const { session } = afterQuickAnswers()

        session.setAutoAdvance(false)

        expect(inQuestion(session).previousGrade).toBeNull()
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
        expect(trainer.grade).toBeNull()
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
        expect(state.trainer.grade).toBeNull()
        expect(state.previousGrade).toBeNull()
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
        expect(state.trainer.grade).toBeNull()
        expect(state.number).toBe(1)
      })

      it('goes on in the normal mode: check grades and stays on the question', () => {
        const { session } = afterQuickAnswers()
        session.setAutoAdvance(false)

        checkRight(session)

        const state = inQuestion(session)
        expect(state.number).toBe(3)
        expect(state.trainer.grade).toEqual({ correct: true })
        expect(state.previousGrade).toBeNull()
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

        session.next()

        const state = inQuestion(session)
        expect(state.number).toBe(4)
        expect(state.previousGrade).toBeNull()
        expect(state.trainer.grade).toBeNull()
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

    // Criterion 2 of the slice: in the quick mode a result never stays on its own question.
    describe('turned off while already off on a shown result', () => {
      it('keeps the result and the question', () => {
        const { session } = setup()
        session.start(10)
        answerWrong(session)

        session.setAutoAdvance(false)

        const state = inQuestion(session)
        expect(state.number).toBe(1)
        expect(state.trainer.grade).toEqual({ correct: false })
        expect(state.previousGrade).toBeNull()
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
