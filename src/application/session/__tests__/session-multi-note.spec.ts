import { describe, expect, it } from 'vitest'
import type { Clock } from '@/application/ports'
import { createSession } from '@/application/session'
import type { Session, SessionState } from '@/application/session'
import { presetDifficulty, type Difficulty } from '@/domain/difficulty'
import type { Letter } from '@/domain/pitch'
import type { Duration, Note, Question } from '@/domain/question'
import { createQuestion } from '@/domain/question'

// Feature multi-note-questions, slice 1: a session of questions of several notes, criteria 11
// and 15–17. The quick mode is slice 2.

const half: Duration = { value: 'half' }
const quarter: Duration = { value: 'quarter' }

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

type SessionModes = Parameters<typeof createSession>[2]

function setup(modes: Partial<Pick<SessionModes, 'showAnswerAtOnce' | 'difficulty'>> = {}) {
  let now = 0
  const clock: Clock = { now: () => now }
  const difficulties: Difficulty[] = []
  const session = createSession(
    (difficulty) => {
      difficulties.push(difficulty)
      return (): Question => THREE
    },
    clock,
    {
      autoAdvance: false,
      showAnswerAtOnce: false,
      difficulty: SEVERAL,
      chooseAutoAdvance: () => {},
      chooseShowAnswerAtOnce: () => {},
      ...modes,
    },
  )
  return {
    session,
    difficulties,
    elapse: (ms: number) => {
      now += ms
    },
  }
}

type QuestionPhase = Extract<SessionState, { phase: 'question' }>

function inQuestion(session: Session): QuestionPhase {
  const { state } = session
  if (state.phase !== 'question') throw new Error(`expected question phase, got ${state.phase}`)
  return state
}

function answer(session: Session, ...answers: [Letter, Duration][]) {
  for (const [letter, duration] of answers) {
    session.select(letter)
    session.selectDuration(duration)
  }
}

const RIGHT: [Letter, Duration][] = [
  ['C', half],
  ['E', quarter],
  ['G', quarter],
]

describe('a session of questions of several notes', () => {
  it('asks the generator for the difficulty with the question length', () => {
    const { session, difficulties } = setup()

    session.start('unlimited')

    expect(difficulties).toEqual([SEVERAL])
    expect(inQuestion(session).trainer.question.notes).toHaveLength(3)
  })

  // Criterion 11.
  it('moves between the notes of the question', () => {
    const { session } = setup()
    session.start('unlimited')

    session.nextNote()
    session.nextNote()
    expect(inQuestion(session).trainer.current).toBe(2)
    session.previousNote()
    expect(inQuestion(session).trainer.current).toBe(1)
    session.goToNote(0)
    expect(inQuestion(session).trainer.current).toBe(0)
  })

  it('ignores moving between the notes before a session starts', () => {
    const { session } = setup()

    session.nextNote()
    session.previousNote()
    session.goToNote(1)

    expect(session.state).toEqual({ phase: 'choosing' })
  })

  // Criterion 15.
  it('counts two points a note and the question once for a right answer', () => {
    const { session, elapse } = setup()
    session.start('unlimited')
    session.noteDrawn()
    elapse(3000)
    answer(session, ...RIGHT)

    session.check()

    expect(inQuestion(session).score).toEqual({
      checked: 1,
      points: 6,
      maxPoints: 6,
      streak: 1,
      bestStreak: 1,
      totalTimeMs: 3000,
    })
  })

  it('counts the points of the right parts and drops the streak for one wrong name', () => {
    const { session } = setup()
    session.start('unlimited')
    answer(session, ...RIGHT)
    session.check()
    session.next()
    answer(session, ['C', half], ['F', quarter], ['G', quarter])

    session.check()

    expect(inQuestion(session).score).toMatchObject({
      checked: 2,
      points: 11,
      maxPoints: 12,
      streak: 0,
      bestStreak: 1,
    })
  })

  it('counts one point a note when the duration is not asked', () => {
    const { session } = setup({ difficulty: { ...SEVERAL, askDuration: false } })
    session.start('unlimited')
    for (const letter of ['C', 'D', 'G'] as const) session.select(letter)

    session.check()

    expect(inQuestion(session).score).toMatchObject({ checked: 1, points: 2, maxPoints: 3 })
  })

  it('counts nothing while a note has no answer', () => {
    const { session } = setup()
    session.start('unlimited')
    answer(session, ['C', half], ['E', quarter])

    session.check()

    expect(inQuestion(session).score).toMatchObject({ checked: 0, points: 0, maxPoints: 0 })
    expect(inQuestion(session).trainer.hint).toBe(true)
  })

  // Criterion 16: points come from the first attempt only.
  it('adds no points for the second attempt', () => {
    const { session } = setup()
    session.start('unlimited')
    answer(session, ['C', half], ['F', quarter], ['G', quarter])
    session.check()

    session.select('E')
    session.check()

    expect(inQuestion(session).trainer.outcome).toBe('correct-second-try')
    expect(inQuestion(session).score).toMatchObject({ checked: 1, points: 5, maxPoints: 6 })
  })

  // Criterion 17.
  it('ends the question at once with the right answer shown at once', () => {
    const { session } = setup({ showAnswerAtOnce: true })
    session.start('unlimited')
    answer(session, ['C', half], ['F', quarter], ['G', quarter])

    session.check()

    expect(inQuestion(session).trainer.outcome).toBe('incorrect')
    expect(inQuestion(session).score).toMatchObject({ points: 5, maxPoints: 6 })
  })

  it('opens the next question on its first note', () => {
    const { session } = setup()
    session.start('unlimited')
    answer(session, ...RIGHT)
    session.check()

    session.next()

    expect(inQuestion(session).number).toBe(2)
    expect(inQuestion(session).trainer.current).toBe(0)
    expect(inQuestion(session).trainer.firstGrade).toBeNull()
  })
})
