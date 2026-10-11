import { describe, expect, it } from 'vitest'
import type { Clock } from '@/application/ports'
import { createSession } from '@/application/session'
import type { Session, SessionState } from '@/application/session'
import { presetDifficulty, type Difficulty } from '@/domain/difficulty'
import type { Exercise } from '@/domain/session'
import type { Letter, Pitch } from '@/domain/pitch'
import { createQuestion, type Question } from '@/domain/question'

// Feature m2-write-notes, slice 1: a session in the exercise chosen before it (criterion 1). In
// Write notes the user writes the named note on the staff and checks it; the points, the second
// attempt, Show the right answer at once, the streak and the results go as in M1 (criterion 12).
// The check is always explicit, in the quick mode too, which only drops the pause (criterion 10).

const CONFIDENT_READING = presetDifficulty('confident-reading')
const FIRST_STEPS = presetDifficulty('first-steps')

const pitch = (letter: Letter, octave: number): Pitch => ({ letter, octave })
const G4 = pitch('G', 4)
const F4 = pitch('F', 4)
const E4 = pitch('E', 4)

// Whatever the difficulty, the questions go G4, F4, G4… as quarter notes; the difficulty each
// session asked for is recorded.
function questionSource() {
  const served: Question[] = []
  const difficulties: Difficulty[] = []
  const next = () => {
    const note = served.length % 2 === 0 ? G4 : F4
    const question = createQuestion({ pitch: note, duration: { value: 'quarter' } })
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
  exercise: Exercise
}

// Stands for the preferences. Unless told otherwise: Write notes in Confident reading.
function rememberedModes(initial: Partial<Modes> = {}) {
  const modes: Modes = {
    autoAdvance: false,
    showAnswerAtOnce: false,
    difficulty: CONFIDENT_READING,
    exercise: 'write',
    ...initial,
  }
  return {
    get difficulty() {
      return modes.difficulty
    },
    get exercise() {
      return modes.exercise
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
  }
}

function setup(remembered: Partial<Modes> = {}) {
  const source = questionSource()
  const time = fakeClock()
  const session = createSession(source.questionsFor, time.clock, rememberedModes(remembered))
  return { session, source, clock: time }
}

type WritingPhase = Extract<SessionState, { phase: 'writing' }>

function inWriting(session: Session): WritingPhase {
  const { state } = session
  if (state.phase !== 'writing') throw new Error(`expected writing phase, got ${state.phase}`)
  return state
}

function soleNote(session: Session) {
  const [note, ...others] = inWriting(session).writing.question.notes
  if (!note || others.length > 0) throw new Error('expected a question of one note')
  return note
}

const rightPitch = (session: Session): Pitch => soleNote(session).pitch

// Below G4 and F4 alike, and within every range here.
const wrongPitch = (): Pitch => E4
const anotherWrongPitch = (): Pitch => pitch('D', 4)

function writeRight(session: Session) {
  session.noteDrawn()
  session.place(rightPitch(session))
  session.check()
}

function writeWrongTwice(session: Session) {
  session.noteDrawn()
  session.place(wrongPitch())
  session.check()
  session.place(anotherWrongPitch())
  session.check()
}

describe('the exercise of a session', () => {
  it('is Write notes when chosen: the session opens on a question to write', () => {
    const { session, source } = setup()

    session.start(10)

    const state = inWriting(session)
    expect(state.number).toBe(1)
    expect(state.length).toBe(10)
    expect(state.isLast).toBe(false)
    expect(state.writing.question).toBe(source.served[0])
    expect(state.writing.placed).toBeNull()
    expect(state.previousOutcome).toBeNull()
  })

  it('is Read notes when chosen: the session opens on a question to name, as before', () => {
    const { session } = setup({ exercise: 'read' })

    session.start(10)

    expect(session.state.phase).toBe('question')
  })

  // Slice 1: until slices 2 and 3, a question to write is one note, a quarter, without signs or
  // the duration asked; the range and the ledger lines are those of the difficulty.
  it('asks the questions to write within the difficulty narrowed to slice 1', () => {
    const { session, source } = setup({ difficulty: CONFIDENT_READING })

    session.start(10)

    expect(source.difficulties).toEqual([
      {
        ...CONFIDENT_READING,
        questionLength: 'one-note',
        keySignatures: 0,
        accidentals: 'none',
        askDuration: false,
        durations: ['quarter'],
        dots: false,
      },
    ])
  })

  it('asks the questions to read within the difficulty itself', () => {
    const { session, source } = setup({ exercise: 'read', difficulty: CONFIDENT_READING })

    session.start(10)

    expect(source.difficulties).toEqual([CONFIDENT_READING])
  })

  it('writes the note within the range and the ledger lines of the difficulty', () => {
    const { session } = setup({ difficulty: FIRST_STEPS })
    session.start(10)

    // First steps: C4–C5 without ledger lines, so D4 is the lowest step.
    session.place(pitch('C', 4))
    expect(inWriting(session).writing.placed).toEqual(pitch('D', 4))

    session.place(pitch('A', 5))
    expect(inWriting(session).writing.placed).toEqual(pitch('C', 5))
  })

  it('writes the note on the middle step with a step before it is written', () => {
    const { session } = setup({ difficulty: FIRST_STEPS })
    session.start(10)

    session.stepUp()
    expect(inWriting(session).writing.placed).toEqual(G4)

    session.stepDown()
    expect(inWriting(session).writing.placed).toEqual(F4)
  })
})

describe('a session of Write notes', () => {
  it('counts a right note as one point, the duration not asked', () => {
    const { session } = setup()
    session.start(10)

    writeRight(session)

    const { score, writing } = inWriting(session)
    expect(writing.outcome).toBe('correct')
    expect(score).toMatchObject({ checked: 1, points: 1, maxPoints: 1, streak: 1, bestStreak: 1 })
  })

  it('counts a note wrong on the first attempt as no point, right on the second or not', () => {
    const { session } = setup()
    session.start(10)

    session.noteDrawn()
    session.place(wrongPitch())
    session.check()
    expect(inWriting(session).writing.outcome).toBeNull()
    session.place(rightPitch(session))
    session.check()

    const { score, writing } = inWriting(session)
    expect(writing.outcome).toBe('correct-second-try')
    expect(score).toMatchObject({ checked: 1, points: 0, maxPoints: 1, streak: 0 })
  })

  it('ends the question after a wrong second attempt', () => {
    const { session } = setup()
    session.start(10)

    writeWrongTwice(session)

    expect(inWriting(session).writing.outcome).toBe('incorrect')
    expect(inWriting(session).score).toMatchObject({ checked: 1, points: 0, maxPoints: 1 })
  })

  it('asks for the note on a check before it is written, counting nothing', () => {
    const { session } = setup()
    session.start(10)

    session.check()

    expect(inWriting(session).writing.hint).toBe('place-note')
    expect(inWriting(session).score.checked).toBe(0)
  })

  it('asks to move the note on a check on the rejected step, the question still open', () => {
    const { session } = setup()
    session.start(10)
    session.noteDrawn()
    session.place(wrongPitch())
    session.check()

    session.check()

    const { writing, score } = inWriting(session)
    expect(writing.hint).toBe('move-note')
    expect(writing.outcome).toBeNull()
    expect(score).toMatchObject({ checked: 1, points: 0, maxPoints: 1 })
  })

  it('ends the question at once on a wrong note with Show the right answer at once', () => {
    const { session } = setup({ showAnswerAtOnce: true })
    session.start(10)

    session.noteDrawn()
    session.place(wrongPitch())
    session.check()

    expect(inWriting(session).writing.outcome).toBe('incorrect')
  })

  it('times the answer from the drawn staff to the first check', () => {
    const { session, clock } = setup()
    session.start(10)
    clock.elapse(5000)

    session.noteDrawn()
    clock.elapse(3000)
    session.place(rightPitch(session))
    session.check()

    expect(inWriting(session).score.totalTimeMs).toBe(3000)
  })

  it('opens the next question with Next, with nothing written', () => {
    const { session, source } = setup()
    session.start(10)
    writeRight(session)

    session.next()

    const state = inWriting(session)
    expect(state.number).toBe(2)
    expect(state.writing.question).toBe(source.served[1])
    expect(state.writing.placed).toBeNull()
    expect(state.writing.outcome).toBeNull()
  })

  it('keeps the question on Next before it is over', () => {
    const { session } = setup()
    session.start(10)
    session.noteDrawn()
    session.place(wrongPitch())
    session.check()

    session.next()

    expect(inWriting(session).number).toBe(1)
  })

  it('keeps the streak across questions and breaks it on a wrong one', () => {
    const { session } = setup()
    session.start(10)

    writeRight(session)
    session.next()
    writeRight(session)
    session.next()
    expect(inWriting(session).score).toMatchObject({ streak: 2, bestStreak: 2 })

    writeWrongTwice(session)
    expect(inWriting(session).score).toMatchObject({ streak: 0, bestStreak: 2 })
  })

  it('shows the results after the last question', () => {
    const { session } = setup()
    session.start(10)
    for (let number = 1; number < 10; number++) {
      writeRight(session)
      session.next()
    }
    expect(inWriting(session).isLast).toBe(true)
    writeRight(session)

    session.next()

    const { state } = session
    expect(state.phase).toBe('results')
    expect(state).toMatchObject({ score: { checked: 10, points: 10, maxPoints: 10 } })
  })

  it('shows the results of the checked questions when finished early', () => {
    const { session } = setup()
    session.start('unlimited')
    writeRight(session)
    session.next()

    session.finish()

    expect(session.state).toMatchObject({ phase: 'results', score: { checked: 1, points: 1 } })
  })

  it('opens the choice again when finished before any check', () => {
    const { session } = setup()
    session.start('unlimited')

    session.finish()

    expect(session.state.phase).toBe('choosing')
  })

  it('reads the exercise on start: a new session takes the newly chosen one', () => {
    const source = questionSource()
    const modes = { ...rememberedModes(), exercise: 'write' as Exercise }
    const session = createSession(source.questionsFor, fakeClock().clock, modes)
    session.start('unlimited')
    expect(session.state.phase).toBe('writing')
    session.finish()

    modes.exercise = 'read'
    session.start('unlimited')

    expect(session.state.phase).toBe('question')
  })
})

describe('a session of Write notes in the quick mode', () => {
  it('never checks by itself: a written note waits for Check', () => {
    const { session } = setup({ autoAdvance: true })
    session.start(10)

    session.noteDrawn()
    session.place(rightPitch(session))
    session.stepUp()
    session.stepDown()

    expect(inWriting(session).writing.outcome).toBeNull()
    expect(inWriting(session).score.checked).toBe(0)
  })

  it('opens the next question at once after a right note, its result shown there', () => {
    const { session } = setup({ autoAdvance: true })
    session.start(10)

    writeRight(session)

    const state = inWriting(session)
    expect(state.number).toBe(2)
    expect(state.writing.placed).toBeNull()
    expect(state.previousOutcome).toBe('correct')
    expect(state.score).toMatchObject({ checked: 1, points: 1 })
  })

  it('stays on a wrong note for the second attempt, then opens the next one when right', () => {
    const { session } = setup({ autoAdvance: true })
    session.start(10)

    session.noteDrawn()
    session.place(wrongPitch())
    session.check()
    expect(inWriting(session).number).toBe(1)

    session.place(rightPitch(session))
    session.check()

    expect(inWriting(session).number).toBe(2)
    expect(inWriting(session).previousOutcome).toBe('correct-second-try')
  })

  it('stops on the review after a wrong second attempt, left with Next', () => {
    const { session } = setup({ autoAdvance: true })
    session.start(10)

    writeWrongTwice(session)
    expect(inWriting(session).number).toBe(1)
    expect(inWriting(session).writing.outcome).toBe('incorrect')

    session.next()

    expect(inWriting(session).number).toBe(2)
    expect(inWriting(session).previousOutcome).toBeNull()
  })

  it('goes on to the results after a right last note', () => {
    const { session } = setup({ autoAdvance: true })
    session.start(10)
    for (let number = 1; number < 10; number++) writeRight(session)
    expect(inWriting(session).number).toBe(10)

    writeRight(session)

    expect(session.state).toMatchObject({ phase: 'results', score: { checked: 10 } })
  })

  // As in M1: back in the normal mode a result left from the quick mode would read as belonging to
  // this question.
  it('drops the result of the previous question when turned off, the written note kept', () => {
    const { session } = setup({ autoAdvance: true })
    session.start(10)
    writeRight(session)
    session.place(pitch('A', 4))
    expect(inWriting(session).previousOutcome).toBe('correct')

    session.setAutoAdvance(false)

    const state = inWriting(session)
    expect(state.previousOutcome).toBeNull()
    expect(state.number).toBe(2)
    expect(state.writing.placed).toEqual(pitch('A', 4))
  })

  it('opens the next question when turned on over a result', () => {
    const { session } = setup()
    session.start(10)
    writeRight(session)

    session.setAutoAdvance(true)

    expect(inWriting(session).number).toBe(2)
    expect(inWriting(session).previousOutcome).toBe('correct')
  })
})
