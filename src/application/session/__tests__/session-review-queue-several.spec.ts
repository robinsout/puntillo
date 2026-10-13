import { describe, expect, it } from 'vitest'
import type { Clock, Random } from '@/application/ports'
import { createReviewQueueService } from '@/application/review-queue'
import { createSession } from '@/application/session'
import type { Session, SessionState } from '@/application/session'
import { presetDifficulty } from '@/domain/difficulty'
import { LETTERS, type Letter, type Pitch } from '@/domain/pitch'
import { createQuestion, type Duration, type Note, type Question } from '@/domain/question'
import type { ReviewItem } from '@/domain/review-queue'

// Feature review-queue, slice 2: a session of questions of several notes. Each note wrong in the
// first attempt is an item of its own (criterion 1). The generator gets the items due in the order
// of their priority: an earlier deadline first, then the ones wrong twice (criterion 7). An item
// the questions do not take stays due until one does, and then counts as returned (edge case 3).
//
// The queue is the real service. The question source stands for the generator: it asks the
// questions of the plan, by their number, and otherwise a question of one note, G5 whole, that no
// test misses; what it is given due is kept for each question.

const ALMOST_ONE = 1 - Number.EPSILON

const constant = (value: number): Random => ({ next: () => value })

// Gives the values in turn, then the last one for ever.
function inTurn(...values: number[]): Random {
  const queue = [...values]
  const last = values.at(-1) ?? 0
  return { next: () => queue.shift() ?? last }
}

const CONFIDENT_READING = presetDifficulty('confident-reading')

const QUARTER: Duration = { value: 'quarter' }

const quarter = (letter: Letter): Note => ({ pitch: { letter, octave: 4 }, duration: QUARTER })
const itemOf = ({ pitch, duration }: Note): ReviewItem => ({ pitch, duration })

const C4 = quarter('C')
const E4 = quarter('E')
const G4 = quarter('G')
const FILLER = createQuestion({ pitch: { letter: 'G', octave: 5 }, duration: { value: 'whole' } })

function questionSource(plan: Record<number, (due: readonly ReviewItem[]) => Question>) {
  const given: (readonly ReviewItem[])[] = []
  const next = (due: readonly ReviewItem[] = []): Question => {
    given.push(due)
    return plan[given.length]?.(due) ?? FILLER
  }
  return { questionsFor: () => next, given }
}

const asking =
  (...notes: [Note, ...Note[]]) =>
  (): Question =>
    createQuestion(...notes)

function setup(random: Random, plan: Record<number, (due: readonly ReviewItem[]) => Question>) {
  const source = questionSource(plan)
  const clock: Clock = { now: () => 0 }
  const session = createSession(
    source.questionsFor,
    clock,
    {
      autoAdvance: false,
      showAnswerAtOnce: false,
      difficulty: CONFIDENT_READING,
      chooseAutoAdvance: () => {},
      chooseShowAnswerAtOnce: () => {},
    },
    () => createReviewQueueService(random),
  )
  session.start('unlimited')
  return { session, source }
}

type QuestionPhase = Extract<SessionState, { phase: 'question' }>

function inQuestion(session: Session): QuestionPhase {
  const { state } = session
  if (state.phase !== 'question') throw new Error(`expected question phase, got ${state.phase}`)
  return state
}

const notesOf = (session: Session) => inQuestion(session).trainer.question.notes

const wrongFor = (pitch: Pitch, avoid?: Letter): Letter =>
  LETTERS.find((letter) => letter !== pitch.letter && letter !== avoid) ?? 'C'

// Each note by its index: wrong in the first attempt and then right, or wrong in both; the notes
// not named are right in the first attempt.
interface Plan {
  readonly wrongOnce?: readonly number[]
  readonly wrongTwice?: readonly number[]
}

function answer(session: Session, { wrongOnce = [], wrongTwice = [] }: Plan = {}) {
  const missed = [...wrongOnce, ...wrongTwice]
  notesOf(session).forEach(({ pitch, duration }, index) => {
    session.goToNote(index)
    session.select(missed.includes(index) ? wrongFor(pitch) : pitch.letter)
    session.selectDuration(duration)
  })
  session.check()
  if (missed.length === 0) return
  notesOf(session).forEach(({ pitch }, index) => {
    if (!missed.includes(index)) return
    session.goToNote(index)
    session.select(wrongTwice.includes(index) ? wrongFor(pitch, wrongFor(pitch)) : pitch.letter)
  })
  session.check()
}

// Answers each question up to the last one, by the plan or else right, moving on after each but
// the last.
function play(session: Session, last: number, plans: Record<number, Plan> = {}) {
  for (;;) {
    const { number } = inQuestion(session)
    answer(session, plans[number])
    if (number >= last) return
    session.next()
  }
}

describe('review queue in a session of questions of several notes', () => {
  it('brings back each note wrong in the first attempt, and no note answered right', () => {
    const { session, source } = setup(constant(0), { 1: asking(C4, E4, G4) })

    play(session, 3, { 1: { wrongOnce: [0, 2] } })
    session.next()

    expect(source.given.slice(0, 3)).toEqual([[], [], []])
    expect(source.given[3]).toHaveLength(2)
    expect(source.given[3]).toEqual(expect.arrayContaining([itemOf(C4), itemOf(G4)]))
  })

  it('gives the generator the note wrong twice first among the notes due on one question', () => {
    const { session, source } = setup(constant(0), { 1: asking(C4, E4, G4) })

    play(session, 3, { 1: { wrongOnce: [0], wrongTwice: [2] } })
    session.next()

    expect(source.given[3]).toEqual([itemOf(G4), itemOf(C4)])
  })

  it('gives the generator the note of an earlier deadline first, though it was missed later', () => {
    // C4, missed first, is drawn for the tenth question after it; E4, missed on the next
    // question, for the third after its own.
    const { session, source } = setup(inTurn(ALMOST_ONE, 0), {
      1: asking(C4, G4),
      2: asking(E4, G4),
    })

    play(session, 10, { 1: { wrongOnce: [0] }, 2: { wrongOnce: [0] } })
    session.next()

    expect(source.given[10]).toEqual([itemOf(E4), itemOf(C4)])
  })

  describe('a note the questions do not take (edge case 3)', () => {
    it('is given to the generator on every question until one takes it, then counts as returned', () => {
      // The questions 4 to 6 do not take C4, the seventh does.
      const { session, source } = setup(constant(0), {
        1: asking(C4, E4),
        7: asking(E4, C4),
      })

      play(session, 9, { 1: { wrongOnce: [0] } })
      session.next()

      expect(source.given.slice(3, 7)).toEqual([
        [itemOf(C4)],
        [itemOf(C4)],
        [itemOf(C4)],
        [itemOf(C4)],
      ])
      // Right on the seventh question: due again on the third after it.
      expect(source.given.slice(7, 9)).toEqual([[], []])
      expect(source.given[9]).toEqual([itemOf(C4)])
    })
  })
})
