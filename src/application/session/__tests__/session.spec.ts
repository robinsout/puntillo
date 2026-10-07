import { describe, expect, it } from 'vitest'
import type { Scheduler } from '@/application/ports'
import { createSession } from '@/application/session'
import type { Session, SessionState } from '@/application/session'
import { LETTERS } from '@/domain/pitch'
import type { Letter } from '@/domain/pitch'
import type { Question } from '@/domain/question'
import { createQuestion } from '@/domain/question'
import type { SessionLength } from '@/domain/session'

// Подменённый источник вопросов: бесконечный, каждый вызов — новый объект вопроса,
// выданные вопросы запоминаются по порядку.
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

// Подменённый планировщик с ручным временем: задачи выполняются только в elapse().
function fakeScheduler() {
  let now = 0
  let tasks: { due: number; task: () => void }[] = []

  const scheduler: Scheduler = {
    schedule(ms, task) {
      const entry = { due: now + ms, task }
      tasks.push(entry)
      return () => {
        tasks = tasks.filter((other) => other !== entry)
      }
    },
  }

  return {
    scheduler,
    get pending() {
      return tasks.length
    },
    elapse(ms: number) {
      now += ms
      const due = tasks.filter((entry) => entry.due <= now)
      tasks = tasks.filter((entry) => entry.due > now)
      due.forEach((entry) => entry.task())
    },
  }
}

function setup() {
  const source = questionSource()
  const clock = fakeScheduler()
  const advances = { count: 0 }
  const session = createSession(source.next, clock.scheduler, () => {
    advances.count += 1
  })
  return { session, source, clock, advances }
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

function answerRight(session: Session) {
  session.select(rightLetter(session))
  session.check()
}

function answerWrong(session: Session) {
  session.select(wrongLetter(session))
  session.check()
}

// Проходит вопросы вручную (верный ответ + Next), пока не откроется вопрос с номером target.
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

      expect(inQuestion(session).score).toEqual({ checked: 0, correct: 0 })
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

    it('grows by one on the automatic advance', () => {
      const { session, source, clock } = setup()
      session.setAutoAdvance(true)
      session.start(10)

      answerRight(session)
      clock.elapse(1500)

      const state = inQuestion(session)
      expect(state.number).toBe(2)
      expect(state.trainer.question).toBe(source.served[1])
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

      expect(inQuestion(session).score).toEqual({ checked: 1, correct: 1 })
    })

    it('counts a wrong check as checked only', () => {
      const { session } = setup()
      session.start(10)

      answerWrong(session)

      expect(inQuestion(session).score).toEqual({ checked: 1, correct: 0 })
    })

    it('does not count the hint', () => {
      const { session } = setup()
      session.start(10)

      session.check()

      expect(inQuestion(session).score).toEqual({ checked: 0, correct: 0 })
    })

    it('does not count the same question twice when check is pressed again', () => {
      const { session } = setup()
      session.start(10)

      answerRight(session)
      session.check()

      expect(inQuestion(session).score).toEqual({ checked: 1, correct: 1 })
    })

    it('adds up over several questions', () => {
      const { session } = setup()
      session.start(10)

      answerRight(session)
      session.next()
      answerWrong(session)
      session.next()
      answerRight(session)

      expect(inQuestion(session).score).toEqual({ checked: 3, correct: 2 })
    })
  })

  describe('last question of a fixed session', () => {
    it.each<10 | 20 | 50>([10, 20, 50])('is question %s of %s', (length) => {
      const { session } = setup()
      session.start(length)

      goToQuestion(session, length - 1)
      expect(inQuestion(session).isLast).toBe(false)

      answerRight(session)
      session.next()

      const state = inQuestion(session)
      expect(state.number).toBe(length)
      expect(state.isLast).toBe(true)
    })

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

      expect(inResults(session).score).toEqual({ checked: 10, correct: 9 })
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

  describe('last question with automatic advance on', () => {
    function onLastQuestion() {
      const context = setup()
      context.session.setAutoAdvance(true)
      context.session.start(10)
      goToQuestion(context.session, 10)
      return context
    }

    it('opens the results exactly 1.5 seconds after the check', () => {
      const { session, clock } = onLastQuestion()

      answerRight(session)
      clock.elapse(1499)

      expect(inQuestion(session).number).toBe(10)

      clock.elapse(1)

      expect(inResults(session).score).toEqual({ checked: 10, correct: 10 })
    })

    it('reports the automatic move to the results once', () => {
      const { session, clock, advances } = onLastQuestion()
      const before = advances.count

      answerRight(session)
      clock.elapse(1500)

      expect(advances.count).toBe(before + 1)
    })

    it('opens the results once when next is pressed during the pause', () => {
      const { session, clock, advances } = onLastQuestion()
      const before = advances.count
      answerRight(session)
      clock.elapse(500)

      session.next()

      expect(inResults(session).score).toEqual({ checked: 10, correct: 10 })
      expect(clock.pending).toBe(0)

      clock.elapse(1500)

      expect(session.state.phase).toBe('results')
      expect(advances.count).toBe(before)
    })

    it('does not disturb the next session when next was pressed during the pause', () => {
      const { session, clock, source } = onLastQuestion()
      answerRight(session)
      session.next()
      session.newSession()
      session.start(10)
      const first = source.served.at(-1)

      clock.elapse(1500)

      const state = inQuestion(session)
      expect(state.number).toBe(1)
      expect(state.trainer.question).toBe(first)
    })

    it('stays on the question when turned off during the pause', () => {
      const { session, clock } = onLastQuestion()
      answerRight(session)
      clock.elapse(500)

      session.setAutoAdvance(false)
      clock.elapse(1500)

      const state = inQuestion(session)
      expect(session.autoAdvance).toBe(false)
      expect(state.number).toBe(10)
      expect(state.trainer.grade).toEqual({ correct: true })
    })

    it('leaves only next to the results when turned off during the pause', () => {
      const { session } = onLastQuestion()
      answerRight(session)
      session.setAutoAdvance(false)

      session.next()

      expect(inResults(session).score).toEqual({ checked: 10, correct: 10 })
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

    it('keeps advancing automatically past 50 questions', () => {
      const { session, clock } = setup()
      session.setAutoAdvance(true)
      session.start('unlimited')

      for (let number = 1; number <= 55; number += 1) {
        answerRight(session)
        clock.elapse(1500)
      }

      expect(inQuestion(session).number).toBe(56)
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

      expect(inResults(session).score).toEqual({ checked: 10, correct: 8 })
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
      expect(state.score).toEqual({ checked: 0, correct: 0 })
      expect(state.trainer.question).not.toBe(lastShown)
      expect(state.trainer.question).toBe(source.served.at(-1))
      expect(state.trainer.selected).toBeNull()
      expect(state.trainer.grade).toBeNull()
      expect(state.trainer.hint).toBe(false)
    })

    it('keeps automatic advance on between sessions', () => {
      const { session, clock } = setup()
      session.setAutoAdvance(true)
      session.start(10)
      goToQuestion(session, 10)
      answerRight(session)
      clock.elapse(1500)

      session.newSession()
      session.start(10)

      expect(session.autoAdvance).toBe(true)

      answerRight(session)
      clock.elapse(1500)

      expect(inQuestion(session).number).toBe(2)
    })

    it('keeps automatic advance off between sessions once turned off', () => {
      const { session, clock } = setup()
      session.setAutoAdvance(true)
      session.start(10)
      session.setAutoAdvance(false)
      goToQuestion(session, 10)
      answerRight(session)
      session.next()

      session.newSession()
      session.start(10)
      answerRight(session)
      clock.elapse(1500)

      expect(session.autoAdvance).toBe(false)
      expect(inQuestion(session).number).toBe(1)
    })
  })
})
