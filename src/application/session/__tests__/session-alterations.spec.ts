import { describe, expect, it } from 'vitest'
import type { Clock } from '@/application/ports'
import { createSession } from '@/application/session'
import type { Session, SessionState } from '@/application/session'
import { presetDifficulty, type Difficulty } from '@/domain/difficulty'
import type { KeySignature } from '@/domain/key-signature'
import type { Letter, Pitch } from '@/domain/pitch'
import type { Duration, Note, Question } from '@/domain/question'
import { COMMON_TIME, createQuestionOf } from '@/domain/question'

// Feature accidentals, slice 1: the toggles Sharp and Flat in a session (criterion 7), offered
// only with key signatures or, since slice 2, accidentals in the difficulty, and in the quick mode. A toggle never answers by
// itself: in the quick mode a question is checked by the name or the duration that completes its
// last note, so the toggle is pressed before it, as Dot is.

const quarter: Duration = { value: 'quarter' }
const half: Duration = { value: 'half' }

const ONE_SHARP: KeySignature = { count: 1, accidental: 'sharp' }

const note = (letter: Letter, alteration?: Pitch['alteration'], duration = quarter): Note => ({
  pitch: alteration === undefined ? { letter, octave: 5 } : { letter, octave: 5, alteration },
  duration,
})

// Every question is F♯5, a quarter, in a key of one sharp.
const F_SHARP = createQuestionOf(COMMON_TIME, [note('F', 1)], ONE_SHARP)
// Every question is F♯5 a half, then E5 a quarter, in a key of one sharp.
const TWO = createQuestionOf(COMMON_TIME, [note('F', 1, half), note('E')], ONE_SHARP)

const CONFIDENT_READING = presetDifficulty('confident-reading')

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
    difficulty: CONFIDENT_READING,
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

describe('the toggles Sharp and Flat of a session', () => {
  it.each([2, 4, 7] as const)('are offered with up to %i key signatures', (keySignatures) => {
    const difficulty = { ...CONFIDENT_READING, keySignatures }

    expect(inQuestion(setup(F_SHARP, { difficulty })).sharpsAndFlats).toBe(true)
  })

  // Edge case 1: without key signatures and accidentals everything works as before.
  it('are not offered without key signatures and accidentals', () => {
    const difficulty: Difficulty = { ...CONFIDENT_READING, keySignatures: 0, accidentals: 'none' }

    expect(inQuestion(setup(F_SHARP, { difficulty })).sharpsAndFlats).toBe(false)
  })

  // Feature accidentals, slice 2, criterion 7: accidentals alone call for the toggles.
  it('are offered with accidentals and no key signatures', () => {
    const difficulty: Difficulty = {
      ...CONFIDENT_READING,
      keySignatures: 0,
      accidentals: 'sharp-and-flat',
    }

    expect(inQuestion(setup(F_SHARP, { difficulty })).sharpsAndFlats).toBe(true)
  })

  it('are offered with key signatures and no accidentals', () => {
    const difficulty: Difficulty = { ...CONFIDENT_READING, keySignatures: 2, accidentals: 'none' }

    expect(inQuestion(setup(F_SHARP, { difficulty })).sharpsAndFlats).toBe(true)
  })

  // The alteration belongs to the name, so it is offered when the duration is not asked as well.
  it('are offered when the duration is not asked', () => {
    const difficulty = { ...CONFIDENT_READING, askDuration: false }

    expect(inQuestion(setup(F_SHARP, { difficulty })).sharpsAndFlats).toBe(true)
  })
})

describe('the toggles in the normal mode', () => {
  it('set the alteration of the current note', () => {
    const session = setup(F_SHARP)

    session.toggleSharp()
    expect(inQuestion(session).trainer.alteration).toBe(1)

    session.toggleFlat()
    expect(inQuestion(session).trainer.alteration).toBe(-1)

    session.toggleFlat()
    expect(inQuestion(session).trainer.alteration).toBeNull()
  })

  it('make «fa♯» the answer, and Check takes it', () => {
    const session = setup(F_SHARP)

    session.toggleSharp()
    session.select('F')
    session.selectDuration(quarter)
    session.check()

    expect(inQuestion(session).trainer.outcome).toBe('correct')
    expect(inQuestion(session).score).toMatchObject({ points: 2, maxPoints: 2 })
  })

  it('refuse «fa» for fa♯: a point for the duration alone', () => {
    const session = setup(F_SHARP)

    session.select('F')
    session.selectDuration(quarter)
    session.check()

    expect(inQuestion(session).trainer.firstGrade).toEqual([{ pitch: false, duration: true }])
    expect(inQuestion(session).score).toMatchObject({ points: 1, maxPoints: 2 })
  })
})

describe('the toggles in the quick mode', () => {
  it('do not answer by themselves, even when they end the last note', () => {
    const session = setup(F_SHARP, { autoAdvance: true })

    session.answerDuration(quarter)
    session.toggleSharp()

    expect(inQuestion(session).score.checked).toBe(0)
    expect(inQuestion(session).trainer.alteration).toBe(1)
  })

  it('go with the name that answers: «fa♯» is right', () => {
    const session = setup(F_SHARP, { autoAdvance: true })

    session.toggleSharp()
    session.answerDuration(quarter)
    session.answer('F')

    expect(inQuestion(session).score).toMatchObject({ checked: 1, points: 2, streak: 1 })
    expect(inQuestion(session).previousOutcome).toBe('correct')
  })

  it('go with the duration that answers', () => {
    const session = setup(F_SHARP, { autoAdvance: true })

    session.answer('F')
    session.toggleSharp()
    session.answerDuration(quarter)

    expect(inQuestion(session).score).toMatchObject({ checked: 1, points: 2 })
  })

  // The answer is complete before the sharp, so it is checked without it.
  it('come too late after the name that completes the answer', () => {
    const session = setup(F_SHARP, { autoAdvance: true })

    session.answerDuration(quarter)
    session.answer('F')

    expect(inQuestion(session).trainer.firstGrade).toEqual([{ pitch: false, duration: true }])
  })

  it('answer the second attempt on the pitch with the sharp', () => {
    const session = setup(F_SHARP, { autoAdvance: true })
    session.answerDuration(quarter)
    session.answer('F')

    session.toggleSharp()
    session.answer('F')

    expect(inQuestion(session).previousOutcome).toBe('correct-second-try')
  })

  it('check a question of two notes once the last one is answered', () => {
    const session = setup(TWO, { autoAdvance: true })

    session.toggleSharp()
    session.answer('F')
    session.answerDuration(half)
    expect(inQuestion(session).score.checked).toBe(0)
    session.answer('E')
    session.answerDuration(quarter)

    expect(inQuestion(session).score).toMatchObject({ checked: 1, points: 4, maxPoints: 4 })
  })

  it('are released at every note when the quick mode is turned on mid-question', () => {
    const session = setup(TWO)
    session.toggleSharp()

    session.setAutoAdvance(true)

    expect(inQuestion(session).trainer.notes.map((choice) => choice.alteration)).toEqual([
      null,
      null,
    ])
  })
})
