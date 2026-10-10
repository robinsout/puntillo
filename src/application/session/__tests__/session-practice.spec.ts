import { describe, expect, it } from 'vitest'
import type { Clock } from '@/application/ports'
import { createSession } from '@/application/session'
import type { Session, SessionState } from '@/application/session'
import { presetDifficulty, type Difficulty } from '@/domain/difficulty'
import { createQuestion, type Question } from '@/domain/question'

// Feature wiki, criterion 6: Practice this starts a session with the difficulty of the article;
// the difficulty of the user stays as it was and is back for the next session.

const FIRST_STEPS = presetDifficulty('first-steps')
const PRACTICE: Difficulty = {
  ...FIRST_STEPS,
  durations: ['eighth', 'half'],
  askDuration: true,
}

const WHOLE_C4 = createQuestion({ pitch: { letter: 'C', octave: 4 }, duration: { value: 'whole' } })

function setup() {
  const clock: Clock = { now: () => 0 }
  const asked: Difficulty[] = []
  const changes: string[] = []
  const preferences = {
    difficulty: FIRST_STEPS,
    autoAdvance: false,
    showAnswerAtOnce: false,
    chooseAutoAdvance(on: boolean) {
      changes.push(`autoAdvance ${on}`)
    },
    chooseShowAnswerAtOnce(on: boolean) {
      changes.push(`showAnswerAtOnce ${on}`)
    },
  }
  const questionsFor = (difficulty: Difficulty) => {
    asked.push(difficulty)
    return (): Question => WHOLE_C4
  }
  const session = createSession(questionsFor, clock, preferences)
  return { session, asked, preferences, changes }
}

type QuestionPhase = Extract<SessionState, { phase: 'question' }>

function inQuestion(session: Session): QuestionPhase {
  const { state } = session
  if (state.phase !== 'question') throw new Error(`expected a question, got ${state.phase}`)
  return state
}

describe('a session started with a difficulty of its own', () => {
  it('asks the questions with that difficulty, not with the one of the preferences', () => {
    const { session, asked } = setup()

    session.start('unlimited', PRACTICE)

    expect(asked).toEqual([PRACTICE])
  })

  it('has no limit when started so', () => {
    const { session } = setup()

    session.start('unlimited', PRACTICE)

    expect(inQuestion(session).length).toBe('unlimited')
  })

  it('offers the durations of that difficulty, longest first', () => {
    const { session } = setup()

    session.start('unlimited', PRACTICE)

    expect(inQuestion(session).durations).toEqual(['half', 'eighth'])
    expect(inQuestion(session).trainer.askDuration).toBe(true)
  })

  it('leaves the difficulty of the preferences and the boxes as they were', () => {
    const { session, preferences, changes } = setup()

    session.start('unlimited', PRACTICE)
    session.finish()

    expect(preferences.difficulty).toBe(FIRST_STEPS)
    expect(changes).toEqual([])
  })

  it('is followed by a session with the difficulty of the preferences again', () => {
    const { session, asked } = setup()
    session.start('unlimited', PRACTICE)
    session.finish()
    session.newSession()

    session.start(10)

    expect(asked).toEqual([PRACTICE, FIRST_STEPS])
    expect(inQuestion(session).trainer.askDuration).toBe(false)
  })
})
