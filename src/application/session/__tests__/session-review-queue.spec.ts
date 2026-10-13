import { describe, expect, it } from 'vitest'
import type { Clock, Random } from '@/application/ports'
import { createReviewQueueService } from '@/application/review-queue'
import { createSession } from '@/application/session'
import type { Session, SessionState } from '@/application/session'
import { presetDifficulty, type Difficulty } from '@/domain/difficulty'
import { LETTERS, type Letter, type Pitch } from '@/domain/pitch'
import { createQuestion, DURATION_VALUES, type Duration, type Question } from '@/domain/question'
import type { ReviewItem } from '@/domain/review-queue'
import type { Exercise } from '@/domain/session'

// Feature review-queue, slice 1: in a session a note wrong in the first attempt comes back on a
// later question, 3 to 10 questions after, or 3 to 5 when the second attempt was wrong too
// (criteria 1, 4 and 10), in Read notes and in Write notes alike (criterion 2), until it is right
// twice in a row (criterion 8). Each session starts with an empty queue (edge case 1).
//
// The queue is the real service, its random source a constant: 0 brings an item back on the
// earliest question, almost 1 on the latest. The question source stands for the generator: it
// asks about the first due item it is given, otherwise it goes on through its notes in turn, so
// that no note comes back by chance within the questions of a test.

const ALMOST_ONE = 1 - Number.EPSILON

const constant = (value: number): Random => ({ next: () => value })

// Confident reading asks for the duration; First steps does not.
const CONFIDENT_READING = presetDifficulty('confident-reading')
const FIRST_STEPS = presetDifficulty('first-steps')

const QUARTER: Duration = { value: 'quarter' }

// C4 to B5 in reading: fourteen notes before one comes again.
const TWO_OCTAVES: readonly Pitch[] = [4, 5].flatMap((octave) =>
  LETTERS.map((letter): Pitch => ({ letter, octave })),
)
// C4 to B4 in writing: every one of them within the range of First steps.
const ONE_OCTAVE: readonly Pitch[] = LETTERS.map((letter): Pitch => ({ letter, octave: 4 }))

function questionSource(pitches: readonly Pitch[]) {
  const given: (readonly ReviewItem[])[] = []
  let turn = 0
  const next = (due: readonly ReviewItem[] = []): Question => {
    given.push(due)
    const [first] = due
    if (first) return createQuestion({ pitch: first.pitch, duration: first.duration })
    const pitch = pitches[turn % pitches.length] as Pitch
    turn += 1
    return createQuestion({ pitch, duration: QUARTER })
  }
  return { questionsFor: () => next, given }
}

interface Modes {
  autoAdvance: boolean
  showAnswerAtOnce: boolean
  difficulty: Difficulty
  exercise: Exercise
}

function rememberedModes(initial: Partial<Modes>) {
  const modes: Modes = {
    autoAdvance: false,
    showAnswerAtOnce: false,
    difficulty: CONFIDENT_READING,
    exercise: 'read',
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

function setup(random: Random, initial: Partial<Modes> = {}) {
  const pitches = initial.exercise === 'write' ? ONE_OCTAVE : TWO_OCTAVES
  const source = questionSource(pitches)
  const clock: Clock = { now: () => 0 }
  const session = createSession(source.questionsFor, clock, rememberedModes(initial), () =>
    createReviewQueueService(random),
  )
  session.start('unlimited')
  return { session, source }
}

type QuestionPhase = Extract<SessionState, { phase: 'question' }>
type WritingPhase = Extract<SessionState, { phase: 'writing' }>

function inQuestion(session: Session): QuestionPhase {
  const { state } = session
  if (state.phase !== 'question') throw new Error(`expected question phase, got ${state.phase}`)
  return state
}

function inWriting(session: Session): WritingPhase {
  const { state } = session
  if (state.phase !== 'writing') throw new Error(`expected writing phase, got ${state.phase}`)
  return state
}

const questionOf = (session: Session): Question =>
  session.state.phase === 'writing'
    ? inWriting(session).writing.question
    : inQuestion(session).trainer.question

function soleNote(session: Session) {
  const [note, ...others] = questionOf(session).notes
  if (!note || others.length > 0) throw new Error('expected a question of one note')
  return note
}

const numberOf = (session: Session): number =>
  session.state.phase === 'writing' ? inWriting(session).number : inQuestion(session).number

const shown = (session: Session): string => {
  const { pitch, duration } = soleNote(session)
  return `${pitch.letter}${pitch.octave}/${duration.value}`
}

// Reading.

const rightLetter = (session: Session): Letter => soleNote(session).pitch.letter
const wrongLetter = (session: Session): Letter => (rightLetter(session) === 'C' ? 'D' : 'C')
const anotherWrongLetter = (session: Session): Letter =>
  LETTERS.find((letter) => letter !== rightLetter(session) && letter !== wrongLetter(session)) ??
  'E'
const rightDuration = (session: Session): Duration => soleNote(session).duration
const wrongDuration = (session: Session): Duration =>
  rightDuration(session).value === 'whole' ? { value: 'half' } : { value: 'whole' }
const anotherWrongDuration = (session: Session): Duration => ({
  value:
    DURATION_VALUES.find(
      (value) => value !== rightDuration(session).value && value !== wrongDuration(session).value,
    ) ?? 'eighth',
})

function readRight(session: Session) {
  session.select(rightLetter(session))
  session.selectDuration(rightDuration(session))
  session.check()
}

function readWrongName(session: Session) {
  session.select(wrongLetter(session))
  session.selectDuration(rightDuration(session))
  session.check()
}

// Both attempts wrong by the name.
function readWrongTwice(session: Session) {
  readWrongName(session)
  session.select(anotherWrongLetter(session))
  session.check()
}

function readWrongThenRight(session: Session) {
  readWrongName(session)
  session.select(rightLetter(session))
  session.check()
}

// The name right, the duration wrong in both attempts.
function readWrongDurationTwice(session: Session) {
  session.select(rightLetter(session))
  session.selectDuration(wrongDuration(session))
  session.check()
  session.selectDuration(anotherWrongDuration(session))
  session.check()
}

// Writing, where First steps does not ask for the duration.

const rightPitch = (session: Session): Pitch => soleNote(session).pitch
const wrongPitch = (session: Session): Pitch => ({
  letter: rightPitch(session).letter === 'C' ? 'D' : 'C',
  octave: 4,
})
const anotherWrongPitch = (session: Session): Pitch => ({
  letter: rightPitch(session).letter === 'E' ? 'F' : 'E',
  octave: 4,
})

function writeRight(session: Session) {
  session.place(rightPitch(session))
  session.check()
}

function writeWrongTwice(session: Session) {
  session.place(wrongPitch(session))
  session.check()
  session.place(anotherWrongPitch(session))
  session.check()
}

type Answer = (session: Session) => void

// Answers each question up to the last one, by the plan or else right, and moves on after each but
// the last; gives the note of each question shown, from the current one on.
function play(
  session: Session,
  last: number,
  plan: Record<number, Answer> = {},
  otherwise: Answer = readRight,
): string[] {
  const notes: string[] = []
  for (;;) {
    session.noteDrawn()
    const number = numberOf(session)
    notes.push(shown(session))
    ;(plan[number] ?? otherwise)(session)
    if (number >= last) return notes
    session.next()
  }
}

describe('review queue in a session', () => {
  describe('a note wrong in the first attempt (criteria 1 and 4)', () => {
    it('comes back on the third question after it at the earliest', () => {
      const { session } = setup(constant(0))

      const notes = play(session, 4, { 1: readWrongTwice })

      expect(notes).toEqual(['C4/quarter', 'D4/quarter', 'E4/quarter', 'C4/quarter'])
    })

    it('comes back on the fifth question after it at the latest when wrong twice', () => {
      const { session } = setup(constant(ALMOST_ONE))

      const notes = play(session, 6, { 1: readWrongTwice })

      expect(notes.slice(1, 5)).not.toContain('C4/quarter')
      expect(notes[5]).toBe('C4/quarter')
    })

    it('comes back on the tenth question after it at the latest when right in the second attempt (criterion 10)', () => {
      const { session } = setup(constant(ALMOST_ONE))

      const notes = play(session, 11, { 1: readWrongThenRight })

      expect(notes.slice(1, 10)).not.toContain('C4/quarter')
      expect(notes[10]).toBe('C4/quarter')
    })

    it('comes back within 3 to 10 questions when the right answer is shown at once', () => {
      const { session } = setup(constant(ALMOST_ONE), { showAnswerAtOnce: true })

      const notes = play(session, 11, { 1: readWrongName })

      expect(notes.slice(1, 10)).not.toContain('C4/quarter')
      expect(notes[10]).toBe('C4/quarter')
    })

    it('comes back when only its duration was wrong', () => {
      const { session } = setup(constant(0))

      const notes = play(session, 4, { 1: readWrongDurationTwice })

      expect(notes[3]).toBe('C4/quarter')
    })

    it('comes back with the duration of the question when the duration is not asked', () => {
      const { session, source } = setup(constant(0), { difficulty: FIRST_STEPS })
      const readWrongNameOnly: Answer = (current) => {
        current.select(wrongLetter(current))
        current.check()
        current.select(anotherWrongLetter(current))
        current.check()
      }
      const readNameRight: Answer = (current) => {
        current.select(rightLetter(current))
        current.check()
      }

      play(session, 4, { 1: readWrongNameOnly }, readNameRight)

      expect(source.given[3]).toEqual([{ pitch: { letter: 'C', octave: 4 }, duration: QUARTER }])
    })

    it('comes back in the quick mode too', () => {
      const { session } = setup(constant(0), { autoAdvance: true })
      const missQuickTwice: Answer = (current) => {
        current.selectDuration(rightDuration(current))
        current.answer(wrongLetter(current))
        current.answer(anotherWrongLetter(current))
      }
      const answerQuickRight: Answer = (current) => {
        current.selectDuration(rightDuration(current))
        current.answer(rightLetter(current))
      }

      const notes: string[] = []
      for (let number = 1; number <= 4; number++) {
        session.noteDrawn()
        notes.push(shown(session))
        if (number === 1) {
          missQuickTwice(session)
          session.next()
        } else if (number < 4) answerQuickRight(session)
      }

      expect(notes).toEqual(['C4/quarter', 'D4/quarter', 'E4/quarter', 'C4/quarter'])
    })
  })

  it('brings back nothing while every answer is right', () => {
    const { session, source } = setup(constant(0))

    play(session, 15)

    expect(source.given.every((due) => due.length === 0)).toBe(true)
  })

  it('gives the generator nothing due before the item comes due', () => {
    const { session, source } = setup(constant(0))

    play(session, 3, { 1: readWrongTwice })
    session.next()

    expect(source.given.slice(0, 3)).toEqual([[], [], []])
    expect(source.given[3]).toEqual([{ pitch: { letter: 'C', octave: 4 }, duration: QUARTER }])
  })

  describe('a returned note (criteria 8 and 9)', () => {
    it('comes back once more after the first right answer on it', () => {
      const { session } = setup(constant(0))

      const notes = play(session, 7, { 1: readWrongTwice })

      expect(notes[3]).toBe('C4/quarter')
      expect(notes[6]).toBe('C4/quarter')
    })

    it('leaves after the second right answer in a row', () => {
      const { session, source } = setup(constant(0))

      play(session, 7, { 1: readWrongTwice })
      const asked = source.given.length
      session.next()
      play(session, 18)

      expect(source.given.slice(asked).every((due) => due.length === 0)).toBe(true)
    })

    it('comes back again after a wrong answer on it', () => {
      const { session } = setup(constant(0))

      const notes = play(session, 10, { 1: readWrongTwice, 7: readWrongTwice })

      expect(notes[3]).toBe('C4/quarter')
      expect(notes[6]).toBe('C4/quarter')
      expect(notes[9]).toBe('C4/quarter')
    })
  })

  describe('in Write notes (criterion 2)', () => {
    it('brings a note written wrong back on the third question after it', () => {
      const { session } = setup(constant(0), { exercise: 'write', difficulty: FIRST_STEPS })

      const notes = play(session, 4, { 1: writeWrongTwice }, writeRight)

      expect(notes).toEqual(['C4/quarter', 'D4/quarter', 'E4/quarter', 'C4/quarter'])
    })

    it('brings it back within 3 to 5 questions when written wrong twice', () => {
      const { session } = setup(constant(ALMOST_ONE), {
        exercise: 'write',
        difficulty: FIRST_STEPS,
      })

      const notes = play(session, 6, { 1: writeWrongTwice }, writeRight)

      expect(notes.slice(1, 5)).not.toContain('C4/quarter')
      expect(notes[5]).toBe('C4/quarter')
    })
  })

  describe('a new session (edge case 1)', () => {
    it('starts with an empty queue', () => {
      const { session, source } = setup(constant(0))
      play(session, 2, { 1: readWrongTwice })
      session.finish()
      session.newSession()
      const asked = source.given.length

      session.start('unlimited')
      play(session, 12)

      expect(source.given.slice(asked).every((due) => due.length === 0)).toBe(true)
    })

    it('starts with an empty queue after a session that ran to its end', () => {
      const { session, source } = setup(constant(0))
      session.start(10)
      play(session, 10, { 9: readWrongTwice, 10: readWrongTwice })
      session.next()
      const asked = source.given.length

      session.newSession()
      session.start(10)
      play(session, 10)

      expect(source.given.slice(asked).every((due) => due.length === 0)).toBe(true)
    })
  })
})
