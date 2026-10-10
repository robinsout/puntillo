import { describe, expect, it } from 'vitest'
import type { Clock } from '@/application/ports'
import { createSession } from '@/application/session'
import type { Session, SessionState } from '@/application/session'
import { presetDifficulty, type Difficulty } from '@/domain/difficulty'
import type { Letter } from '@/domain/pitch'
import type { Duration, Note, Question } from '@/domain/question'
import { createQuestion } from '@/domain/question'

// Feature multi-note-questions, slice 5: the toggle Dot in a session (criterion 13), shown only
// with the dots on, and in the quick mode (criterion 19). The dot never answers by itself: in the
// quick mode a question is checked by the name or the duration that completes its last note, so
// the dot is pressed before it.

const quarter: Duration = { value: 'quarter' }
const half: Duration = { value: 'half' }
const dotted = (value: Duration['value']): Duration => ({ value, dots: 1 })

const note = (letter: Letter, duration: Duration): Note => ({
  pitch: { letter, octave: 4 },
  duration,
})

// Every question is C4 dotted half, then E4 quarter.
const TWO = createQuestion(note('C', dotted('half')), note('E', quarter))
// Every question is C4 dotted quarter.
const ONE = createQuestion(note('C', dotted('quarter')))

const ADVANCED = presetDifficulty('advanced')

interface Modes {
  autoAdvance: boolean
  showAnswerAtOnce: boolean
  difficulty: Difficulty
}

function setup(question: Question, initial: Partial<Modes> = {}) {
  const clock: Clock = { now: () => 0 }
  const modes: Modes = {
    autoAdvance: false,
    showAnswerAtOnce: false,
    difficulty: ADVANCED,
    ...initial,
  }
  const session = createSession(() => (): Question => question, clock, {
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
  session.start('unlimited')
  session.noteDrawn()
  return session
}

type QuestionPhase = Extract<SessionState, { phase: 'question' }>

function inQuestion(session: Session): QuestionPhase {
  const { state } = session
  if (state.phase !== 'question') throw new Error(`expected a question, got ${state.phase}`)
  return state
}

describe('the dots of a session', () => {
  it('are offered with the dots on', () => {
    expect(inQuestion(setup(ONE)).dots).toBe(true)
  })

  it('are not offered with the dots off', () => {
    expect(inQuestion(setup(ONE, { difficulty: { ...ADVANCED, dots: false } })).dots).toBe(false)
  })

  // The dot belongs to the duration, so a question that does not ask for it offers no dot.
  it('are not offered when the duration is not asked', () => {
    const difficulty = { ...ADVANCED, askDuration: false }

    expect(inQuestion(setup(ONE, { difficulty })).dots).toBe(false)
  })
})

describe('toggleDot in the normal mode', () => {
  it('turns the dot of the current note on and off', () => {
    const session = setup(ONE)

    session.toggleDot()
    expect(inQuestion(session).trainer.dot).toBe(true)

    session.toggleDot()
    expect(inQuestion(session).trainer.dot).toBe(false)
  })

  it('dots the chosen duration, and Check takes the dotted quarter', () => {
    const session = setup(ONE)

    session.select('C')
    session.toggleDot()
    session.selectDuration(quarter)
    session.check()

    expect(inQuestion(session).trainer.outcome).toBe('correct')
    expect(inQuestion(session).score).toMatchObject({ points: 2, maxPoints: 2 })
  })

  it('refuses the plain quarter for the dotted one', () => {
    const session = setup(ONE)

    session.select('C')
    session.selectDuration(quarter)
    session.check()

    expect(inQuestion(session).trainer.firstGrade).toEqual([{ pitch: true, duration: false }])
    expect(inQuestion(session).score).toMatchObject({ points: 1, maxPoints: 2 })
  })
})

describe('toggleDot in the quick mode', () => {
  it('does not answer by itself, even when it ends the last note', () => {
    const session = setup(ONE, { autoAdvance: true })

    session.answer('C')
    session.toggleDot()

    expect(inQuestion(session).score.checked).toBe(0)
    expect(inQuestion(session).trainer.dot).toBe(true)
  })

  it('goes with the duration that answers: the dotted quarter is right', () => {
    const session = setup(ONE, { autoAdvance: true })

    session.toggleDot()
    session.answer('C')
    session.answerDuration(quarter)

    expect(inQuestion(session).score).toMatchObject({ checked: 1, points: 2, streak: 1 })
    expect(inQuestion(session).previousOutcome).toBe('correct')
  })

  it('goes with the name that answers', () => {
    const session = setup(ONE, { autoAdvance: true })

    session.answerDuration(quarter)
    session.toggleDot()
    session.answer('C')

    expect(inQuestion(session).score).toMatchObject({ checked: 1, points: 2 })
  })

  // The answer is complete before the dot, so it is checked without it.
  it('comes too late after the duration that completes the answer', () => {
    const session = setup(ONE, { autoAdvance: true })

    session.answer('C')
    session.answerDuration(quarter)

    expect(inQuestion(session).score).toMatchObject({ checked: 1, points: 1 })
    expect(inQuestion(session).trainer.firstGrade).toEqual([{ pitch: true, duration: false }])
  })

  it('answers the second attempt on the duration with the dot', () => {
    const session = setup(ONE, { autoAdvance: true })
    session.answer('C')
    session.answerDuration(quarter)

    session.toggleDot()
    session.answerDuration(quarter)

    expect(inQuestion(session).previousOutcome).toBe('correct-second-try')
  })

  it('checks a question of two notes once the last one has its dotted duration', () => {
    const session = setup(TWO, { autoAdvance: true })

    session.answer('C')
    session.toggleDot()
    session.answerDuration(half)
    expect(inQuestion(session).score.checked).toBe(0)
    session.answer('E')
    session.answerDuration(quarter)

    expect(inQuestion(session).score).toMatchObject({ checked: 1, points: 4, maxPoints: 4 })
  })

  it('turns every dot off when the quick mode is turned on mid-question', () => {
    const session = setup(TWO)
    session.toggleDot()

    session.setAutoAdvance(true)

    expect(inQuestion(session).trainer.notes.map((choice) => choice.dot)).toEqual([false, false])
  })
})
