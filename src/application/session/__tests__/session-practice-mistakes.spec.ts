import { describe, expect, it } from 'vitest'
import type { Clock, Random } from '@/application/ports'
import { createReviewQueueService } from '@/application/review-queue'
import { createSession } from '@/application/session'
import type { Session, SessionState } from '@/application/session'
import { presetDifficulty, type Difficulty } from '@/domain/difficulty'
import { LETTERS, type Letter, type Pitch } from '@/domain/pitch'
import { createQuestion, type Duration, type Question } from '@/domain/question'
import type { ReviewItem } from '@/domain/review-queue'
import type { Exercise, SessionLength } from '@/domain/session'

// Feature session-summary, slice 3: Practice only these, under Most mistakes in the results,
// starts a new session of the same exercise, the same difficulty and the same length as the one
// that ended — on time and No limit included, No limit ended by Finish too (criterion 10, edge
// case 2). Its review queue is filled beforehand with the items of the list, all of them due, in
// the order of the list, from the first question on (criterion 11). From then on it is a session
// like any other: an item leaves after two right answers in a row, a new mistake makes a new item,
// and the results at the end are the usual ones, of this session alone (criterion 12).
//
// The queue is the real service, its random source a constant 0 unless told otherwise: an item
// comes back on the earliest question, 3 after. The question source stands for the generator: it asks about the
// first due item it is given, otherwise it goes on through its notes in turn, so that no note
// comes back by chance within the questions of a test.

const MINUTE = 60_000

const ALMOST_ONE = 1 - Number.EPSILON

const constant = (value: number): Random => ({ next: () => value })

const CONFIDENT_READING = presetDifficulty('confident-reading')
const FIRST_STEPS = presetDifficulty('first-steps')
// As the wiki starts it with Practice this: a difficulty for that session only.
const PRACTICE: Difficulty = { ...CONFIDENT_READING, durations: ['eighth', 'half'] }

const QUARTER: Duration = { value: 'quarter' }

// C4 to B5 in reading: fourteen notes before one comes again.
const TWO_OCTAVES: readonly Pitch[] = [4, 5].flatMap((octave) =>
  LETTERS.map((letter): Pitch => ({ letter, octave })),
)
// D4 to C5 in writing: every one of them within the range of First steps, without ledger lines.
const ONE_OCTAVE: readonly Pitch[] = [
  ...LETTERS.slice(1).map((letter): Pitch => ({ letter, octave: 4 })),
  { letter: 'C', octave: 5 },
]

const item = (letter: Letter, octave = 4): ReviewItem => ({
  pitch: { letter, octave },
  duration: QUARTER,
})

function questionSource(pitches: readonly Pitch[]) {
  const given: (readonly ReviewItem[])[] = []
  const difficulties: Difficulty[] = []
  let turn = 0
  const next = (due: readonly ReviewItem[] = []): Question => {
    given.push(due)
    const [first] = due
    if (first) return createQuestion({ pitch: first.pitch, duration: first.duration })
    const pitch = pitches[turn % pitches.length] as Pitch
    turn += 1
    return createQuestion({ pitch, duration: QUARTER })
  }
  const questionsFor = (difficulty: Difficulty) => {
    difficulties.push(difficulty)
    return next
  }
  return { questionsFor, given, difficulties }
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
    modes,
    preferences: {
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
    },
  }
}

function setup(initial: Partial<Modes> = {}, random: Random = constant(0)) {
  const source = questionSource(initial.exercise === 'write' ? ONE_OCTAVE : TWO_OCTAVES)
  let now = 0
  const clock: Clock = { now: () => now }
  const { modes, preferences } = rememberedModes(initial)
  const session = createSession(source.questionsFor, clock, preferences, (queue) =>
    createReviewQueueService(random, queue),
  )
  const elapse = (ms: number) => {
    now += ms
  }
  return { session, source, modes, elapse }
}

type QuestionPhase = Extract<SessionState, { phase: 'question' }>
type WritingPhase = Extract<SessionState, { phase: 'writing' }>
type ResultsPhase = Extract<SessionState, { phase: 'results' }>

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

function inResults(session: Session): ResultsPhase {
  const { state } = session
  if (state.phase !== 'results') throw new Error(`expected results phase, got ${state.phase}`)
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

// The items of Most mistakes with their counts: "D4/quarter ×1".
const listed = (session: Session): string[] =>
  inResults(session).mostMistakes.map(
    ({ item: { pitch, duration }, count }) =>
      `${pitch.letter}${pitch.octave}/${duration.value} ×${count}`,
  )

// Reading, in Confident reading: the name and the duration asked.

const rightLetter = (session: Session): Letter => soleNote(session).pitch.letter
const wrongLetter = (session: Session): Letter => (rightLetter(session) === 'C' ? 'D' : 'C')
const anotherWrongLetter = (session: Session): Letter =>
  LETTERS.find((letter) => letter !== rightLetter(session) && letter !== wrongLetter(session)) ??
  'E'

function readRight(session: Session) {
  session.select(rightLetter(session))
  session.selectDuration(soleNote(session).duration)
  session.check()
}

function readWrongThenRight(session: Session) {
  session.select(wrongLetter(session))
  session.selectDuration(soleNote(session).duration)
  session.check()
  session.select(rightLetter(session))
  session.check()
}

function readWrongTwice(session: Session) {
  session.select(wrongLetter(session))
  session.selectDuration(soleNote(session).duration)
  session.check()
  session.select(anotherWrongLetter(session))
  session.check()
}

// Writing, in First steps: the duration not asked.

const rightPitch = (session: Session): Pitch => soleNote(session).pitch

function writeRight(session: Session) {
  session.place(rightPitch(session))
  session.check()
}

function writeWrongTwice(session: Session) {
  const { letter } = rightPitch(session)
  const wrong: Pitch = { letter: letter === 'G' ? 'F' : 'G', octave: 4 }
  const another: Pitch = { letter: letter === 'A' ? 'F' : 'A', octave: 4 }
  session.place(wrong)
  session.check()
  session.place(another)
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
    // A question that does not move on would loop for ever.
    if (notes.length > last) throw new Error(`still on question ${number} after ${last}`)
    notes.push(shown(session))
    ;(plan[number] ?? otherwise)(session)
    if (number >= last) return notes
    session.next()
  }
}

// A session of the given length whose first two questions are both wrong, ended by Finish: in
// Read notes C4 and D4, so that Most mistakes lists D4, the later mistake, then C4, one mistake
// each; in Write notes D4 and E4, so that it lists E4, then D4.
function endedWithMistakes(length: SessionLength, initial: Partial<Modes> = {}) {
  const context = setup(initial)
  const wrong = initial.exercise === 'write' ? writeWrongTwice : readWrongTwice
  context.session.start(length)
  play(context.session, 2, { 1: wrong, 2: wrong })
  context.session.finish()
  return context
}

describe('Practice only these', () => {
  describe('the new session (criterion 10)', () => {
    it('starts on its first question with nothing scored', () => {
      const { session } = endedWithMistakes('unlimited')
      expect(listed(session)).toEqual(['D4/quarter ×1', 'C4/quarter ×1'])

      session.practiceMostMistakes()

      expect(inQuestion(session).number).toBe(1)
      expect(inQuestion(session).score.checked).toBe(0)
      expect(inQuestion(session).score.points).toBe(0)
      expect(inQuestion(session).previousOutcome).toBeNull()
    })

    it('has the length of a session of 10 that ended', () => {
      const { session } = endedWithMistakes(10)

      session.practiceMostMistakes()

      expect(inQuestion(session).length).toBe(10)
      expect(inQuestion(session).isLast).toBe(false)
    })

    it('ends after its tenth question, as a session of 10 does', () => {
      const { session } = endedWithMistakes(10)
      session.practiceMostMistakes()

      play(session, 10)

      expect(inQuestion(session).isLast).toBe(true)
      session.next()
      expect(inResults(session).score.checked).toBe(10)
    })

    it('has the length of a session of 20 or 50', () => {
      for (const length of [20, 50] as const) {
        const { session } = endedWithMistakes(length)

        session.practiceMostMistakes()

        expect(inQuestion(session).length).toBe(length)
      }
    })

    it('is on time again, its time counted anew', () => {
      const { session, elapse } = endedWithMistakes({ minutes: 3 })
      elapse(2 * MINUTE)

      session.practiceMostMistakes()

      expect(inQuestion(session).length).toEqual({ minutes: 3 })
      expect(inQuestion(session).elapsedMs).toBe(0)
      expect(inQuestion(session).isLast).toBe(false)
    })

    it('is on time again after a session on time that ran out', () => {
      const { session, elapse } = setup()
      session.start({ minutes: 5 })
      play(session, 1, { 1: readWrongTwice })
      elapse(5 * MINUTE)
      session.next()
      expect(listed(session)).toEqual(['C4/quarter ×1'])

      session.practiceMostMistakes()

      expect(inQuestion(session).length).toEqual({ minutes: 5 })
      elapse(5 * MINUTE - 1)
      expect(inQuestion(session).isLast).toBe(false)
      elapse(1)
      expect(inQuestion(session).isLast).toBe(true)
    })

    it('has no limit after a session with no limit ended by Finish (edge case 2)', () => {
      const { session } = endedWithMistakes('unlimited')

      session.practiceMostMistakes()

      expect(inQuestion(session).length).toBe('unlimited')
    })

    it('reads notes after a session of Read notes', () => {
      const { session } = endedWithMistakes('unlimited')

      session.practiceMostMistakes()

      expect(session.state.phase).toBe('question')
    })

    it('writes notes after a session of Write notes', () => {
      const { session } = endedWithMistakes('unlimited', {
        exercise: 'write',
        difficulty: FIRST_STEPS,
      })

      session.practiceMostMistakes()

      expect(inWriting(session).number).toBe(1)
    })

    it('keeps the exercise of the session that ended, not the one chosen since', () => {
      const { session, modes } = endedWithMistakes('unlimited', {
        exercise: 'write',
        difficulty: FIRST_STEPS,
      })
      modes.exercise = 'read'

      session.practiceMostMistakes()

      expect(session.state.phase).toBe('writing')
    })

    it('asks the questions with the difficulty of the session that ended', () => {
      const { session, source } = endedWithMistakes('unlimited')

      session.practiceMostMistakes()

      expect(source.difficulties.at(-1)).toEqual(CONFIDENT_READING)
    })

    it('keeps the difficulty of the session that ended, not the one chosen since', () => {
      const { session, source, modes } = endedWithMistakes('unlimited')
      modes.difficulty = FIRST_STEPS

      session.practiceMostMistakes()

      expect(source.difficulties.at(-1)).toEqual(CONFIDENT_READING)
      expect(inQuestion(session).trainer.askDuration).toBe(true)
    })

    it('keeps a difficulty the session that ended had of its own, as from Practice this', () => {
      const { session, source } = setup({ difficulty: FIRST_STEPS })
      session.start('unlimited', PRACTICE)
      play(session, 1, { 1: readWrongTwice })
      session.finish()

      session.practiceMostMistakes()

      expect(source.difficulties.at(-1)).toEqual(PRACTICE)
      expect(inQuestion(session).durations).toEqual(['half', 'eighth'])
    })
  })

  describe('the review queue filled beforehand (criterion 11)', () => {
    it('gives the generator every item of the list on the first question, in its order', () => {
      const { session, source } = endedWithMistakes('unlimited')
      const asked = source.given.length

      session.practiceMostMistakes()

      expect(source.given[asked]).toEqual([item('D'), item('C')])
    })

    it('asks about the items from the first question on, then goes on as usual', () => {
      const { session } = endedWithMistakes('unlimited')

      session.practiceMostMistakes()
      const notes = play(session, 3)

      expect(notes).toEqual(['D4/quarter', 'C4/quarter', 'E4/quarter'])
    })

    it('fills the queue in Write notes too', () => {
      const { session } = endedWithMistakes('unlimited', {
        exercise: 'write',
        difficulty: FIRST_STEPS,
      })

      session.practiceMostMistakes()
      const notes = play(session, 3, {}, writeRight)

      expect(notes).toEqual(['E4/quarter', 'D4/quarter', 'F4/quarter'])
    })

    it('fills it with the five items of the list, not with every item wrong', () => {
      // Almost 1 brings a note right in the second attempt back 10 questions later: none of the six
      // comes back within them.
      const { session, source } = setup({}, constant(ALMOST_ONE))
      session.start('unlimited')
      play(session, 6, {}, readWrongThenRight)
      session.finish()
      const asked = source.given.length

      session.practiceMostMistakes()

      // C4, D4, E4, F4, G4 and A4, each wrong once: the latest five, A4 first.
      expect(source.given[asked]).toEqual([item('A'), item('G'), item('F'), item('E'), item('D')])
    })
  })

  describe('then a session like any other (criterion 12)', () => {
    it('brings an item answered right back once more, then lets it go after the second', () => {
      const { session, source } = endedWithMistakes('unlimited')
      session.practiceMostMistakes()

      const notes = play(session, 5)
      const asked = source.given.length
      session.next()
      play(session, 17)

      expect(notes).toEqual(['D4/quarter', 'C4/quarter', 'E4/quarter', 'D4/quarter', 'C4/quarter'])
      expect(source.given.slice(asked).every((due) => due.length === 0)).toBe(true)
    })

    it('brings an item answered wrong back 3 questions later', () => {
      const { session } = endedWithMistakes('unlimited')
      session.practiceMostMistakes()

      const notes = play(session, 4, { 1: readWrongTwice })

      expect(notes).toEqual(['D4/quarter', 'C4/quarter', 'E4/quarter', 'D4/quarter'])
    })

    it('makes a new item of a new mistake', () => {
      const { session } = endedWithMistakes('unlimited')
      session.practiceMostMistakes()

      const notes = play(session, 6, { 3: readWrongTwice })

      expect(notes[2]).toBe('E4/quarter')
      expect(notes[5]).toBe('E4/quarter')
    })

    it('ends in the usual results, with the mistakes of this session alone', () => {
      const { session } = endedWithMistakes('unlimited')
      session.practiceMostMistakes()
      play(session, 3, { 2: readWrongTwice })

      session.finish()

      expect(inResults(session).score.checked).toBe(3)
      expect(listed(session)).toEqual(['C4/quarter ×1'])
    })

    it('ends with No mistakes when every answer of this session is right', () => {
      const { session } = endedWithMistakes('unlimited')
      session.practiceMostMistakes()
      play(session, 2)

      session.finish()

      expect(listed(session)).toEqual([])
    })

    it('can be practiced again from its own results, with its own list', () => {
      const { session, source } = endedWithMistakes(10)
      session.practiceMostMistakes()
      play(session, 3, { 3: readWrongTwice })
      session.finish()
      const asked = source.given.length

      session.practiceMostMistakes()

      expect(inQuestion(session).length).toBe(10)
      expect(source.given[asked]).toEqual([item('E')])
    })
  })

  describe('a session started as usual afterwards', () => {
    it('starts with an empty queue', () => {
      const { session, source } = endedWithMistakes('unlimited')
      session.practiceMostMistakes()
      play(session, 1)
      session.finish()
      session.newSession()
      const asked = source.given.length

      session.start('unlimited')
      play(session, 12)

      expect(source.given.slice(asked).every((due) => due.length === 0)).toBe(true)
    })
  })
})
