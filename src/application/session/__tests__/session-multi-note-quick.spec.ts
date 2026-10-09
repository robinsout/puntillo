import { describe, expect, it } from 'vitest'
import type { Clock } from '@/application/ports'
import { createSession } from '@/application/session'
import type { Session, SessionState } from '@/application/session'
import { presetDifficulty, type Difficulty } from '@/domain/difficulty'
import type { Letter } from '@/domain/pitch'
import type { Duration, Note, Question } from '@/domain/question'
import { createQuestion } from '@/domain/question'

// Feature multi-note-questions, slice 2: the quick mode on a question of several notes,
// criterion 19.

const half: Duration = { value: 'half' }
const quarter: Duration = { value: 'quarter' }
const eighth: Duration = { value: 'eighth' }

const note = (letter: Letter, duration: Duration): Note => ({
  pitch: { letter, octave: 4 },
  duration,
})

// Every question is C4 half, E4 quarter, G4 quarter.
const THREE = createQuestion(note('C', half), note('E', quarter), note('G', quarter))

const SEVERAL: Difficulty = {
  ...presetDifficulty('confident-reading'),
  questionLength: 'two-to-four-notes',
}

interface Modes {
  autoAdvance: boolean
  showAnswerAtOnce: boolean
  difficulty: Difficulty
}

function setup(initial: Partial<Modes> = {}) {
  let now = 0
  const clock: Clock = { now: () => now }
  const modes: Modes = {
    autoAdvance: true,
    showAnswerAtOnce: false,
    difficulty: SEVERAL,
    ...initial,
  }
  const session = createSession(() => (): Question => THREE, clock, {
    get autoAdvance() {
      return modes.autoAdvance
    },
    get showAnswerAtOnce() {
      return modes.showAnswerAtOnce
    },
    get difficulty() {
      return modes.difficulty
    },
    chooseAutoAdvance(on) {
      modes.autoAdvance = on
    },
    chooseShowAnswerAtOnce(on) {
      modes.showAnswerAtOnce = on
    },
  })
  return {
    session,
    elapse: (ms: number) => {
      now += ms
    },
  }
}

function quick(length: 10 | 'unlimited' = 'unlimited', modes: Partial<Modes> = {}) {
  const context = setup(modes)
  context.session.start(length)
  context.session.noteDrawn()
  return context
}

type QuestionPhase = Extract<SessionState, { phase: 'question' }>

function inQuestion(session: Session): QuestionPhase {
  const { state } = session
  if (state.phase !== 'question') throw new Error(`expected question phase, got ${state.phase}`)
  return state
}

// The quick mode answers through answer() and answerDuration() only: the name first here.
function answerNotes(session: Session, ...answers: [Letter, Duration][]) {
  for (const [letter, duration] of answers) {
    session.answer(letter)
    session.answerDuration(duration)
  }
}

const RIGHT: [Letter, Duration][] = [
  ['C', half],
  ['E', quarter],
  ['G', quarter],
]

// Note 2 has a wrong name (F for E) and note 3 a wrong duration (half for quarter).
const WRONG: [Letter, Duration][] = [
  ['C', half],
  ['F', quarter],
  ['G', half],
]

const choicesOf = (session: Session) =>
  inQuestion(session).trainer.notes.map(({ selected, selectedDuration }) =>
    [selected ?? '-', selectedDuration?.value ?? '-'].join(' '),
  )

describe('the quick mode on a question of several notes', () => {
  describe('while a note has no answer', () => {
    it('only chooses: the highlight moves on and nothing is counted', () => {
      const { session } = quick()

      answerNotes(session, ['C', half], ['E', quarter])

      const state = inQuestion(session)
      expect(state.number).toBe(1)
      expect(state.trainer.current).toBe(2)
      expect(choicesOf(session)).toEqual(['C half', 'E quarter', '- -'])
      expect(state.trainer.firstGrade).toBeNull()
      expect(state.trainer.outcome).toBeNull()
      expect(state.trainer.hint).toBe(false)
      expect(state.score.checked).toBe(0)
    })

    it('does not count the question when an answered note is changed', () => {
      const { session } = quick()
      answerNotes(session, ['C', half], ['E', quarter])
      session.goToNote(0)

      session.answer('D')

      const state = inQuestion(session)
      expect(state.number).toBe(1)
      expect(choicesOf(session)).toEqual(['D half', 'E quarter', '- -'])
      expect(state.trainer.firstGrade).toBeNull()
      expect(state.trainer.hint).toBe(false)
      expect(state.score.checked).toBe(0)
    })

    it('does not count the question while the last note has its name only', () => {
      const { session } = quick()
      answerNotes(session, ['C', half], ['E', quarter])

      session.answer('G')

      expect(inQuestion(session).trainer.firstGrade).toBeNull()
      expect(inQuestion(session).score.checked).toBe(0)
    })

    it('ignores check: the quick mode has none', () => {
      const { session } = quick()
      answerNotes(session, ['C', half], ['E', quarter])

      session.check()

      expect(inQuestion(session).trainer.hint).toBe(false)
      expect(inQuestion(session).score.checked).toBe(0)
    })
  })

  describe('the last note without an answer', () => {
    it('answers the question and opens the next one at once when every note is right', () => {
      const { session, elapse } = quick()
      elapse(4000)

      answerNotes(session, ...RIGHT)

      const state = inQuestion(session)
      expect(state.number).toBe(2)
      expect(state.previousOutcome).toBe('correct')
      expect(state.trainer.current).toBe(0)
      expect(choicesOf(session)).toEqual(['- -', '- -', '- -'])
      expect(state.score).toEqual({
        checked: 1,
        points: 6,
        maxPoints: 6,
        streak: 1,
        bestStreak: 1,
        totalTimeMs: 4000,
      })
    })

    it('answers with the duration pressed last as well as with the name', () => {
      const { session } = quick()
      answerNotes(session, ['C', half], ['E', quarter])
      session.answerDuration(quarter)

      session.answer('G')

      expect(inQuestion(session).number).toBe(2)
      expect(inQuestion(session).previousOutcome).toBe('correct')
    })

    it('is the last one left, wherever it stands in the question', () => {
      const { session } = quick()
      session.goToNote(2)
      answerNotes(session, ['G', quarter])
      session.goToNote(1)
      answerNotes(session, ['E', quarter])
      session.goToNote(0)

      answerNotes(session, ['C', half])

      expect(inQuestion(session).number).toBe(2)
      expect(inQuestion(session).score).toMatchObject({ checked: 1, points: 6, maxPoints: 6 })
    })

    it('answers the question with a note changed before it', () => {
      const { session } = quick()
      answerNotes(session, ['C', half], ['E', quarter])
      session.goToNote(1)
      session.answer('F')
      session.goToNote(2)

      answerNotes(session, ['G', quarter])

      expect(inQuestion(session).score).toMatchObject({ checked: 1, points: 5, maxPoints: 6 })
    })

    it('opens the results at once on the last question of a session', () => {
      const { session } = quick(10)
      for (let number = 1; number <= 10; number += 1) answerNotes(session, ...RIGHT)

      expect(session.state).toEqual({
        phase: 'results',
        score: expect.objectContaining({ checked: 10, points: 60, maxPoints: 60 }),
      })
    })
  })

  describe('a wrong answer', () => {
    it('stays on the question for the second attempt on the first wrong note', () => {
      const { session } = quick()

      answerNotes(session, ...WRONG)

      const state = inQuestion(session)
      expect(state.number).toBe(1)
      expect(state.trainer.outcome).toBeNull()
      expect(state.trainer.firstGrade).not.toBeNull()
      expect(state.trainer.current).toBe(1)
      expect(choicesOf(session)).toEqual(['C half', '- quarter', 'G -'])
      expect(state.score).toMatchObject({ checked: 1, points: 4, maxPoints: 6, streak: 0 })
    })

    it('does not grade the second attempt while a wrong note has no new answer', () => {
      const { session } = quick()
      answerNotes(session, ...WRONG)

      session.answer('E')

      const state = inQuestion(session)
      expect(state.trainer.outcome).toBeNull()
      expect(state.trainer.current).toBe(2)
      expect(state.trainer.hint).toBe(false)
    })

    it('does not grade the second attempt when a wrong note answered again is changed', () => {
      const { session } = quick()
      answerNotes(session, ...WRONG)
      session.answer('E')
      session.goToNote(1)

      session.answer('A')

      expect(inQuestion(session).trainer.outcome).toBeNull()
      expect(inQuestion(session).number).toBe(1)
    })

    it('opens the next question with "correct on the second try" once every wrong part is right', () => {
      const { session } = quick()
      answerNotes(session, ...WRONG)
      session.answer('E')

      session.answerDuration(quarter)

      const state = inQuestion(session)
      expect(state.number).toBe(2)
      expect(state.previousOutcome).toBe('correct-second-try')
      expect(state.score).toMatchObject({ checked: 1, points: 4, maxPoints: 6, streak: 0 })
    })

    it('stops on the review when the second attempt is wrong, and moves on on next', () => {
      const { session } = quick()
      answerNotes(session, ...WRONG)
      session.answer('E')
      session.answerDuration(eighth)

      expect(inQuestion(session).number).toBe(1)
      expect(inQuestion(session).trainer.outcome).toBe('incorrect')

      session.next()

      expect(inQuestion(session).number).toBe(2)
      expect(inQuestion(session).previousOutcome).toBeNull()
    })

    it('stops on the review at once with the right answer shown at once', () => {
      const { session } = quick('unlimited', { showAnswerAtOnce: true })

      answerNotes(session, ...WRONG)

      const state = inQuestion(session)
      expect(state.number).toBe(1)
      expect(state.trainer.outcome).toBe('incorrect')
      expect(state.score).toMatchObject({ checked: 1, points: 4, maxPoints: 6 })
    })
  })

  // As with one note, the box starts the choice over: the question is clean, so the highlight
  // goes back to the first note still to answer.
  describe('the box turned on or off mid-question', () => {
    it('clears the choice of every note and goes back to the first one when turned on', () => {
      const { session } = setup({ autoAdvance: false })
      session.start('unlimited')
      session.noteDrawn()
      for (const [letter, duration] of RIGHT.slice(0, 2)) {
        session.select(letter)
        session.selectDuration(duration)
      }

      session.setAutoAdvance(true)

      expect(choicesOf(session)).toEqual(['- -', '- -', '- -'])
      expect(inQuestion(session).trainer.current).toBe(0)
    })

    it('clears the choice of every note and goes back to the first one when turned off', () => {
      const { session } = quick()
      answerNotes(session, ['C', half], ['E', quarter])

      session.setAutoAdvance(false)

      expect(choicesOf(session)).toEqual(['- -', '- -', '- -'])
      expect(inQuestion(session).trainer.current).toBe(0)
    })

    it('keeps the settled parts and goes back to the first wrong note during the second attempt', () => {
      const { session } = quick()
      answerNotes(session, ...WRONG)
      session.answer('E')

      session.setAutoAdvance(false)

      expect(choicesOf(session)).toEqual(['C half', '- quarter', 'G -'])
      expect(inQuestion(session).trainer.current).toBe(1)
    })

    it('does not take the notes answered for Check as a quick answer', () => {
      const { session } = setup({ autoAdvance: false })
      session.start('unlimited')
      session.noteDrawn()
      for (const [letter, duration] of RIGHT.slice(0, 2)) {
        session.select(letter)
        session.selectDuration(duration)
      }
      session.setAutoAdvance(true)

      answerNotes(session, ['G', quarter])

      expect(inQuestion(session).number).toBe(1)
      expect(inQuestion(session).score.checked).toBe(0)
    })
  })
})
