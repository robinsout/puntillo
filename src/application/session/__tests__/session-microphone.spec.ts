import { describe, expect, it } from 'vitest'
import type { Clock } from '@/application/ports'
import { createSession } from '@/application/session'
import type { Session } from '@/application/session'
import { presetDifficulty, type Difficulty } from '@/domain/difficulty'
import type { PianoKey } from '@/domain/keyboard'
import { createQuestion, type Duration, type Question } from '@/domain/question'
import type { Exercise, NoteInput } from '@/domain/session'

// Feature microphone-input, slice 1: in Read notes with the microphone, a note played answers the
// current note of the question (criterion 6). The duration is not asked whatever the difficulty,
// and a note is worth one point (criterion 7); the pitch is graded by its sound and with its octave
// (criterion 8). A note played is an answer, right or wrong: once every note of the question is
// answered, the question is checked with no Check, by the usual rules of the first and the second
// attempt; Open the next question automatically works as usual (criterion 10). A question checked
// takes no note until the next one (edge case 8), and Next works as usual (edge case 9).
//
// Slice 2: a question of several notes takes the notes played in turn and is checked with the last
// one; its second attempt takes the notes marked wrong, in turn, and leaves the right ones
// (criterion 10). A note far from the question, another octave or another overtone of the
// trumpet, is an answer, wrong (edge case 3).

const FIRST_STEPS = presetDifficulty('first-steps')
const CONFIDENT_READING = presetDifficulty('confident-reading')

const QUARTER: Duration = { value: 'quarter' }

const key = (number: number): PianoKey => ({ number })

const DO4 = key(60)
const RE4 = key(62)
const MI4 = key(64)
const SOL4 = key(67)
const LA4 = key(69)
const DO5 = key(72)
const DO3 = key(48)

const C4 = createQuestion({ pitch: { letter: 'C', octave: 4 }, duration: QUARTER })
const D4 = createQuestion({ pitch: { letter: 'D', octave: 4 }, duration: QUARTER })
const C4_E4 = createQuestion(
  { pitch: { letter: 'C', octave: 4 }, duration: QUARTER },
  { pitch: { letter: 'E', octave: 4 }, duration: QUARTER },
)
const C4_E4_G4 = createQuestion(
  { pitch: { letter: 'C', octave: 4 }, duration: QUARTER },
  { pitch: { letter: 'E', octave: 4 }, duration: QUARTER },
  { pitch: { letter: 'G', octave: 4 }, duration: QUARTER },
)

interface Modes {
  autoAdvance: boolean
  showAnswerAtOnce: boolean
  difficulty: Difficulty
  exercise: Exercise
  noteInput: NoteInput
}

interface Setup extends Partial<Modes> {
  readonly questions?: readonly Question[]
}

function started({ questions = [C4, D4], ...initial }: Setup = {}) {
  const modes: Modes = {
    autoAdvance: false,
    showAnswerAtOnce: false,
    difficulty: FIRST_STEPS,
    exercise: 'read',
    noteInput: 'microphone',
    ...initial,
  }
  let served = 0
  const next = (): Question => {
    const question = questions[served % questions.length]
    if (!question) throw new Error('the source has no questions')
    served += 1
    return question
  }
  const clock: Clock = { now: () => 0 }
  const session = createSession(() => next, clock, {
    get difficulty() {
      return modes.difficulty
    },
    get exercise() {
      return modes.exercise
    },
    get noteInput() {
      return modes.noteInput
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
  })
  session.start('unlimited')
  session.noteDrawn()
  return session
}

function onQuestion(session: Session) {
  const { state } = session
  if (state.phase !== 'question') throw new Error(`expected a question, got ${state.phase}`)
  return state
}

describe('a session with the microphone', () => {
  it('reads notes with the microphone when the preferences say so', () => {
    expect(onQuestion(started()).noteInput).toBe('microphone')
  })

  it('does not ask for the duration, though the difficulty does (criterion 7)', () => {
    const session = started({ difficulty: CONFIDENT_READING })

    expect(onQuestion(session).trainer.askDuration).toBe(false)
  })

  it('counts one point for a note, though the difficulty asks for the duration (criterion 7)', () => {
    const session = started({ difficulty: CONFIDENT_READING })

    session.playNote(DO4)

    expect(onQuestion(session).score).toMatchObject({ checked: 1, points: 1, maxPoints: 1 })
  })
})

describe('a note played (criteria 6, 10)', () => {
  it('checks the question it answers, with no Check', () => {
    const session = started()

    session.playNote(DO4)

    const { trainer, score } = onQuestion(session)
    expect(trainer.outcome).toBe('correct')
    expect(trainer.firstGrade).toEqual([{ pitch: true, duration: null }])
    expect(score.checked).toBe(1)
  })

  it('stays on the question after a right note, for Next', () => {
    const session = started()

    session.playNote(DO4)

    expect(onQuestion(session).number).toBe(1)
  })

  it('is graded by its sound and octave: a note an octave off is wrong (criterion 8)', () => {
    const session = started()

    session.playNote(DO5)

    const { trainer, score } = onQuestion(session)
    expect(trainer.firstGrade).toEqual([{ pitch: false, duration: null }])
    expect(score).toMatchObject({ checked: 1, points: 0, maxPoints: 1 })
  })

  it('opens the second attempt after a wrong note', () => {
    const session = started()

    session.playNote(DO5)

    const { trainer } = onQuestion(session)
    expect(trainer.outcome).toBeNull()
    expect(trainer.wrongKey).toEqual(DO5)
  })

  it('checks the second attempt with the next note played', () => {
    const session = started()
    session.playNote(DO5)

    session.playNote(DO4)

    expect(onQuestion(session).trainer.outcome).toBe('correct-second-try')
    expect(onQuestion(session).score).toMatchObject({ checked: 1, points: 0 })
  })

  it('ends the question wrong when the second attempt is wrong too', () => {
    const session = started()
    session.playNote(DO5)

    session.playNote(RE4)

    expect(onQuestion(session).trainer.outcome).toBe('incorrect')
  })

  // Lead's decision: a note played is always an answer, the note rejected in the first attempt too.
  it('ends the question wrong when the note rejected is played again', () => {
    const session = started()
    session.playNote(DO5)

    session.playNote(DO5)

    const { trainer, score } = onQuestion(session)
    expect(trainer.outcome).toBe('incorrect')
    expect(score).toMatchObject({ checked: 1, points: 0 })
  })

  it('ends the question wrong in the quick mode when the note rejected is played again', () => {
    const session = started({ autoAdvance: true })
    session.playNote(DO5)

    session.playNote(DO5)

    const state = onQuestion(session)
    expect(state.number).toBe(1)
    expect(state.trainer.outcome).toBe('incorrect')
  })

  it('ends the question at once with Show the right answer at once', () => {
    const session = started({ showAnswerAtOnce: true })

    session.playNote(DO5)

    expect(onQuestion(session).trainer.outcome).toBe('incorrect')
  })

  it('waits for the last note of the question before the check', () => {
    const session = started({ questions: [C4_E4] })

    session.playNote(DO4)

    const { trainer } = onQuestion(session)
    expect(trainer.firstGrade).toBeNull()
    expect(trainer.current).toBe(1)
  })

  it('checks the question with its last note', () => {
    const session = started({ questions: [C4_E4] })

    session.playNote(DO4)
    session.playNote(MI4)

    expect(onQuestion(session).trainer.outcome).toBe('correct')
  })
})

describe('a question checked (edge case 8)', () => {
  it('takes no note played', () => {
    const session = started()
    session.playNote(DO4)

    session.playNote(RE4)

    const { trainer, score } = onQuestion(session)
    expect(trainer.key).toEqual(DO4)
    expect(trainer.outcome).toBe('correct')
    expect(score.checked).toBe(1)
  })

  it('takes no note after a wrong second attempt', () => {
    const session = started()
    session.playNote(DO5)
    session.playNote(RE4)

    session.playNote(DO4)

    expect(onQuestion(session).trainer.outcome).toBe('incorrect')
  })

  it('leaves the next question to Next, which takes notes again (edge case 9)', () => {
    const session = started()
    session.playNote(DO4)

    session.next()
    session.playNote(RE4)

    const state = onQuestion(session)
    expect(state.number).toBe(2)
    expect(state.trainer.outcome).toBe('correct')
    expect(state.score.checked).toBe(2)
  })
})

describe('the quick mode (criterion 10)', () => {
  it('opens the next question after a right note', () => {
    const session = started({ autoAdvance: true })

    session.playNote(DO4)

    const state = onQuestion(session)
    expect(state.number).toBe(2)
    expect(state.previousOutcome).toBe('correct')
  })

  it('stays on the question for the second attempt after a wrong note', () => {
    const session = started({ autoAdvance: true })

    session.playNote(DO5)

    const state = onQuestion(session)
    expect(state.number).toBe(1)
    expect(state.trainer.wrongKey).toEqual(DO5)
  })

  it('opens the next question after a right second attempt', () => {
    const session = started({ autoAdvance: true })
    session.playNote(DO5)

    session.playNote(DO4)

    const state = onQuestion(session)
    expect(state.number).toBe(2)
    expect(state.previousOutcome).toBe('correct-second-try')
  })
})

describe('a note played outside a question of Read notes', () => {
  it('does nothing in Write notes', () => {
    const session = started({ exercise: 'write' })

    session.playNote(DO4)

    expect(session.state.phase).toBe('writing')
    expect(session.state.phase === 'writing' && session.state.writing.firstGrade).toBeNull()
  })
})

describe('a question of several notes (slice 2, criterion 10)', () => {
  it('takes the notes played in turn', () => {
    const session = started({ questions: [C4_E4_G4] })

    session.playNote(DO4)
    session.playNote(MI4)

    const { trainer } = onQuestion(session)
    expect(trainer.notes.map((note) => note.key)).toEqual([DO4, MI4, null])
    expect(trainer.current).toBe(2)
  })

  it('takes the same note twice for two notes of the question', () => {
    const session = started({ questions: [C4_E4_G4] })

    session.playNote(DO4)
    session.playNote(DO4)

    expect(onQuestion(session).trainer.current).toBe(2)
  })

  it('opens the second attempt on the first note marked wrong', () => {
    const session = started({ questions: [C4_E4_G4] })

    session.playNote(RE4)
    session.playNote(MI4)
    session.playNote(LA4)

    const { trainer, score } = onQuestion(session)
    expect(trainer.outcome).toBeNull()
    expect(trainer.firstGrade?.map((grade) => grade.pitch)).toEqual([false, true, false])
    expect(trainer.current).toBe(0)
    expect(score).toMatchObject({ checked: 1, points: 1, maxPoints: 3 })
  })

  it('takes the notes marked wrong in turn in the second attempt, leaving the right one', () => {
    const session = started({ questions: [C4_E4_G4] })
    ;[RE4, MI4, LA4].forEach((note) => session.playNote(note))

    session.playNote(DO4)

    const { trainer } = onQuestion(session)
    expect(trainer.outcome).toBeNull()
    expect(trainer.current).toBe(2)
    expect(trainer.notes.map((note) => note.key)).toEqual([DO4, MI4, null])
  })

  it('checks the second attempt with the last note marked wrong', () => {
    const session = started({ questions: [C4_E4_G4] })
    ;[RE4, MI4, LA4].forEach((note) => session.playNote(note))

    session.playNote(DO4)
    session.playNote(SOL4)

    expect(onQuestion(session).trainer.outcome).toBe('correct-second-try')
  })

  it('ends the question wrong when a note of the second attempt is wrong', () => {
    const session = started({ questions: [C4_E4_G4] })
    ;[RE4, MI4, LA4].forEach((note) => session.playNote(note))

    session.playNote(DO4)
    session.playNote(LA4)

    expect(onQuestion(session).trainer.outcome).toBe('incorrect')
  })

  it('opens the next question in the quick mode after a right second attempt', () => {
    const session = started({ questions: [C4_E4_G4, D4], autoAdvance: true })
    ;[RE4, MI4, LA4].forEach((note) => session.playNote(note))

    session.playNote(DO4)
    session.playNote(SOL4)

    const state = onQuestion(session)
    expect(state.number).toBe(2)
    expect(state.previousOutcome).toBe('correct-second-try')
  })
})

describe('a note far from the question (slice 2, edge case 3)', () => {
  it('is a wrong answer for its note, another octave', () => {
    const session = started({ questions: [C4_E4], showAnswerAtOnce: true })

    session.playNote(DO3)
    session.playNote(MI4)

    const { trainer } = onQuestion(session)
    expect(trainer.outcome).toBe('incorrect')
    expect(trainer.firstGrade?.map((grade) => grade.pitch)).toEqual([false, true])
    expect(trainer.notes[0]?.wrongKey).toEqual(DO3)
  })

  // The trumpet overblown: the next overtone of the same fingering, G4 for C4.
  it('is a wrong answer for its note, another overtone', () => {
    const session = started({ questions: [C4_E4], showAnswerAtOnce: true })

    session.playNote(SOL4)
    session.playNote(MI4)

    const { trainer } = onQuestion(session)
    expect(trainer.firstGrade?.map((grade) => grade.pitch)).toEqual([false, true])
    expect(trainer.notes[0]?.wrongKey).toEqual(SOL4)
  })
})
