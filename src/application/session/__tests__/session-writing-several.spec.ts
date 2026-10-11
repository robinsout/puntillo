import { describe, expect, it } from 'vitest'
import type { Clock } from '@/application/ports'
import { createSession } from '@/application/session'
import type { Session, SessionState } from '@/application/session'
import { presetDifficulty, type Difficulty } from '@/domain/difficulty'
import type { Letter, Pitch } from '@/domain/pitch'
import { createQuestion, type Duration, type Question } from '@/domain/question'

// Feature m2-write-notes, slice 2: a session of Write notes with questions of several notes and
// the duration asked (criteria 8–10, 12). The session offers the durations and the dot of the
// difficulty, passes the duration, the dot and the moves between the notes to the question, and
// counts two points a note, one for the step and one for the duration, as in M1.

const pitch = (letter: Letter, octave: number): Pitch => ({ letter, octave })
const C4 = pitch('C', 4)
const E4 = pitch('E', 4)
const F4 = pitch('F', 4)
const G4 = pitch('G', 4)

const HALF: Duration = { value: 'half' }
const QUARTER: Duration = { value: 'quarter' }

// Confident reading with whatever question the fake source gives: C4–G5, whole to eighth notes,
// the duration asked, no dots.
const CONFIDENT_READING = presetDifficulty('confident-reading')
const ADVANCED = presetDifficulty('advanced')

// Every question is C4 half, E4 quarter, G4 quarter.
const DO_MI_SOL = createQuestion(
  { pitch: C4, duration: HALF },
  { pitch: E4, duration: QUARTER },
  { pitch: G4, duration: QUARTER },
)

function setup(
  initial: Partial<{
    autoAdvance: boolean
    showAnswerAtOnce: boolean
    difficulty: Difficulty
  }> = {},
) {
  let now = 0
  const clock: Clock = { now: () => now }
  const modes = {
    autoAdvance: false,
    showAnswerAtOnce: false,
    difficulty: CONFIDENT_READING,
    exercise: 'write' as const,
    ...initial,
    chooseAutoAdvance(on: boolean) {
      modes.autoAdvance = on
    },
    chooseShowAnswerAtOnce(on: boolean) {
      modes.showAnswerAtOnce = on
    },
  }
  const served: Question[] = []
  const session = createSession(
    () => () => {
      served.push(DO_MI_SOL)
      return DO_MI_SOL
    },
    clock,
    modes,
  )
  return {
    session,
    served,
    elapse(ms: number) {
      now += ms
    },
  }
}

type WritingPhase = Extract<SessionState, { phase: 'writing' }>

function inWriting(session: Session): WritingPhase {
  const { state } = session
  if (state.phase !== 'writing') throw new Error(`expected writing phase, got ${state.phase}`)
  return state
}

function writeAll(session: Session, notes: readonly [Pitch, Duration][]) {
  notes.forEach(([note, duration], index) => {
    session.place(note, index)
    session.selectDuration(duration)
  })
}

const RIGHT: readonly [Pitch, Duration][] = [
  [C4, HALF],
  [E4, QUARTER],
  [G4, QUARTER],
]

// The step of note 2 and the duration of note 1 wrong.
const TWO_PARTS_WRONG: readonly [Pitch, Duration][] = [
  [C4, QUARTER],
  [F4, QUARTER],
  [G4, QUARTER],
]

describe('a session of Write notes with the duration asked', () => {
  it('offers the durations of the difficulty, from the longest, and no dot without the dots', () => {
    const { session } = setup()
    session.start(10)

    const state = inWriting(session)
    expect(state.durations).toEqual(['whole', 'half', 'quarter', 'eighth'])
    expect(state.dots).toBe(false)
    expect(state.writing.askDuration).toBe(true)
  })

  it('offers the dot when the difficulty has the dots on', () => {
    const { session } = setup({ difficulty: ADVANCED })
    session.start(10)

    expect(inWriting(session).dots).toBe(true)
    expect(inWriting(session).durations).toEqual([
      'whole',
      'half',
      'quarter',
      'eighth',
      'sixteenth',
    ])
  })

  it('offers no dot when the duration is not asked', () => {
    const { session } = setup({ difficulty: { ...ADVANCED, askDuration: false } })
    session.start(10)

    expect(inWriting(session).dots).toBe(false)
    expect(inWriting(session).writing.askDuration).toBe(false)
  })

  it('passes the touch with the index of its note, the duration and the dot to the question', () => {
    const { session } = setup({ difficulty: ADVANCED })
    session.start(10)

    session.place(E4, 1)
    session.toggleDot()
    session.selectDuration(QUARTER)

    const { writing } = inWriting(session)
    expect(writing.current).toBe(1)
    expect(writing.placed).toEqual(E4)
    expect(writing.selectedDuration).toEqual({ value: 'quarter', dots: 1 })
  })

  it('passes the moves between the notes to the question', () => {
    const { session } = setup()
    session.start(10)

    session.nextNote()
    session.nextNote()
    expect(inWriting(session).writing.current).toBe(2)

    session.previousNote()
    expect(inWriting(session).writing.current).toBe(1)

    session.goToNote(0)
    expect(inWriting(session).writing.current).toBe(0)
  })

  it('counts two points a note, the step and the duration', () => {
    const { session } = setup()
    session.start(10)
    session.noteDrawn()

    writeAll(session, RIGHT)
    session.check()

    expect(inWriting(session).writing.outcome).toBe('correct')
    expect(inWriting(session).score).toMatchObject({ checked: 1, points: 6, maxPoints: 6 })
  })

  it('counts the right parts of the first attempt only', () => {
    const { session } = setup()
    session.start(10)
    session.noteDrawn()

    writeAll(session, TWO_PARTS_WRONG)
    session.check()
    session.goToNote(0)
    session.selectDuration(HALF)
    session.place(E4, 1)
    session.check()

    expect(inWriting(session).writing.outcome).toBe('correct-second-try')
    expect(inWriting(session).score).toMatchObject({
      checked: 1,
      points: 4,
      maxPoints: 6,
      streak: 0,
    })
  })

  it('asks for what is missing and counts nothing', () => {
    const { session } = setup()
    session.start(10)
    session.place(C4, 0)

    session.check()

    expect(inWriting(session).writing.hint).toBe('place-note')
    expect(inWriting(session).score.checked).toBe(0)
  })

  it('times the answer from the drawn staff to the first check', () => {
    const { session, elapse } = setup()
    session.start(10)
    session.noteDrawn()
    elapse(4000)

    writeAll(session, RIGHT)
    session.check()

    expect(inWriting(session).score.totalTimeMs).toBe(4000)
  })
})

describe('Write notes of several notes in the quick mode', () => {
  it('never checks by itself, not even once every part is written', () => {
    const { session } = setup({ autoAdvance: true })
    session.start(10)

    writeAll(session, RIGHT)

    expect(inWriting(session).writing.outcome).toBeNull()
    expect(inWriting(session).number).toBe(1)
  })

  it('opens the next question at once after a right check', () => {
    const { session, served } = setup({ autoAdvance: true })
    session.start(10)
    writeAll(session, RIGHT)

    session.check()

    expect(inWriting(session).number).toBe(2)
    expect(inWriting(session).previousOutcome).toBe('correct')
    expect(served).toHaveLength(2)
  })

  it('stays on a wrong question for the second attempt', () => {
    const { session } = setup({ autoAdvance: true })
    session.start(10)
    writeAll(session, TWO_PARTS_WRONG)

    session.check()

    expect(inWriting(session).number).toBe(1)
    expect(inWriting(session).writing.current).toBe(0)
  })
})
