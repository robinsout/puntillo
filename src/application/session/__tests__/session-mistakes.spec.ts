import { describe, expect, it } from 'vitest'
import type { Clock } from '@/application/ports'
import { createSession } from '@/application/session'
import type { Session } from '@/application/session'
import { presetDifficulty, type Difficulty } from '@/domain/difficulty'
import { NO_KEY_SIGNATURE, type KeySignature } from '@/domain/key-signature'
import type { Alteration, Letter, Pitch } from '@/domain/pitch'
import {
  applyAccidentals,
  COMMON_TIME,
  createQuestionOf,
  type Accidental,
  type Duration,
  type NoteOrRest,
  type Question,
} from '@/domain/question'
import type { ItemMistakes } from '@/domain/session'
import type { Exercise, SessionLength } from '@/domain/session'

// Feature session-summary, slice 2: the results of a session hold Most mistakes, up to five items
// — a pitch as written and a duration — wrong in a first attempt, with their number of mistakes
// and the topics of the wiki on the kinds of their mistakes (criteria 6–8; the order and the topics
// themselves are the domain's, see domain/session and domain/wiki). Only the first attempt counts,
// as in the review queue; the mistakes are those of the queue, in Write notes too: a note on
// another step, a sign left out or one too many (edge case 5). Every length counts them, on time
// and with Finish too (criterion 6); with no mistake the list is empty (criterion 9).
//
// The question source stands for the generator: it gives its questions in turn, over and over,
// whatever the review queue asks for.

const CONFIDENT_READING = presetDifficulty('confident-reading')
const FIRST_STEPS = presetDifficulty('first-steps')

const MINUTE = 60_000

const QUARTER: Duration = { value: 'quarter' }
const HALF: Duration = { value: 'half' }
const WHOLE: Duration = { value: 'whole' }

const G_MAJOR: KeySignature = { count: 1, accidental: 'sharp' }

const pitch = (letter: Letter, octave: number, alteration?: Alteration): Pitch =>
  alteration === undefined ? { letter, octave } : { letter, octave, alteration }

const note = (
  letter: Letter,
  octave: number,
  duration: Duration = QUARTER,
  accidental?: Accidental,
): NoteOrRest =>
  accidental
    ? { pitch: pitch(letter, octave), duration, accidental }
    : { pitch: pitch(letter, octave), duration }

// The question in its right notation, as the generator makes it: the pitch of each note is how
// it sounds.
const questionOf = (keySignature: KeySignature, ...elements: NoteOrRest[]): Question =>
  createQuestionOf(COMMON_TIME, applyAccidentals(elements, COMMON_TIME, keySignature), keySignature)

const plain = (...elements: NoteOrRest[]) => questionOf(NO_KEY_SIGNATURE, ...elements)

const C4 = plain(note('C', 4))
const D4 = plain(note('D', 4))
const E4 = plain(note('E', 4))
const F4 = plain(note('F', 4))
const G4 = plain(note('G', 4))
const A4 = plain(note('A', 4))
const B4 = plain(note('B', 4))
const C4_HALF = plain(note('C', 4, HALF))
// F♯4 with a sharp of its own.
const F_SHARP = plain(note('F', 4, QUARTER, 'sharp'))
// F4 in G major: F♯ by the key signature, written without a sign.
const F_IN_G_MAJOR = questionOf(G_MAJOR, note('F', 4))
// C4 and E4 in one question.
const C4_E4 = plain(note('C', 4), note('E', 4))

interface Modes {
  autoAdvance: boolean
  showAnswerAtOnce: boolean
  difficulty: Difficulty
  exercise: Exercise
}

interface Setup extends Partial<Modes> {
  readonly questions: readonly Question[]
  readonly length?: SessionLength
}

function setup({ questions, length = 'unlimited', ...initial }: Setup) {
  const modes: Modes = {
    autoAdvance: false,
    showAnswerAtOnce: false,
    difficulty: CONFIDENT_READING,
    exercise: 'read',
    ...initial,
  }
  let served = 0
  const next = (): Question => {
    const question = questions[served % questions.length]
    if (!question) throw new Error('the source has no questions')
    served += 1
    return question
  }
  let now = 0
  const clock: Clock = { now: () => now }
  const session = createSession(() => next, clock, {
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
  })
  session.start(length)
  session.noteDrawn()
  return {
    session,
    elapse(ms: number) {
      now += ms
    },
  }
}

function questionOn(session: Session): Question {
  const { state } = session
  if (state.phase === 'question') return state.trainer.question
  if (state.phase === 'writing') return state.writing.question
  throw new Error(`expected a question, got ${state.phase}`)
}

function shownNote(session: Session, index = 0) {
  const shown = questionOn(session).notes[index]
  if (!shown) throw new Error(`the question has no note ${index + 1}`)
  return shown
}

function mostMistakes(session: Session): readonly ItemMistakes[] {
  const { state } = session
  if (state.phase !== 'results') throw new Error(`expected the results, got ${state.phase}`)
  return state.mostMistakes
}

const counted = (session: Session) =>
  mostMistakes(session).map(({ item: { pitch, duration }, count }) => ({
    pitch,
    duration,
    count,
  }))

// Reading. A name with its alteration, then the duration if it is asked: the shown one unless
// given.

interface Reading {
  readonly letter: Letter
  readonly alteration?: Alteration
  readonly duration?: Duration
}

function choose(session: Session, { letter, alteration, duration }: Reading, index = 0) {
  session.goToNote(index)
  session.select(letter)
  if (alteration === 1) session.toggleSharp()
  if (alteration === -1) session.toggleFlat()
  session.selectDuration(duration ?? shownNote(session, index).duration)
}

function read(session: Session, ...answers: Reading[]) {
  answers.forEach((answer, index) => choose(session, answer, index))
  session.check()
}

function readRight(session: Session) {
  read(
    session,
    ...questionOn(session).notes.map(({ pitch: { letter, alteration } }) =>
      alteration === undefined ? { letter } : { letter, alteration },
    ),
  )
}

const wrongLetter = (session: Session, index = 0): Letter =>
  shownNote(session, index).pitch.letter === 'B' ? 'A' : 'B'

// The name wrong in the first attempt; the second attempt, if any, wrong again with another name.
function readWrong(session: Session) {
  read(session, { letter: wrongLetter(session) })
  if (session.state.phase === 'question' && session.state.trainer.outcome === null) {
    session.select(shownNote(session).pitch.letter === 'G' ? 'A' : 'G')
    session.check()
  }
}

function readWrongThenRight(session: Session) {
  read(session, { letter: wrongLetter(session) })
  session.select(shownNote(session).pitch.letter)
  session.check()
}

// Writing: a note placed on a step with a sign before it; then the duration, if it is asked.

interface Writing {
  readonly at: Pitch
  readonly accidental?: Accidental
  readonly duration?: Duration
}

function write(session: Session, { at, accidental, duration }: Writing) {
  session.place(at)
  if (accidental === 'sharp') session.toggleSharp()
  if (accidental === 'flat') session.toggleFlat()
  if (accidental === 'natural') session.toggleNatural()
  session.selectDuration(duration ?? shownNote(session).duration)
  session.check()
}

function writeRight(session: Session) {
  const { pitch: right, accidental } = shownNote(session)
  write(session, { at: pitch(right.letter, right.octave), ...(accidental && { accidental }) })
}

// Answers the questions in turn, each by its own answer, and moves on after each but the last.
function play(session: Session, ...answers: ((session: Session) => void)[]) {
  answers.forEach((answer, index) => {
    answer(session)
    if (index < answers.length - 1) session.next()
  })
}

function finish(session: Session) {
  session.finish()
  return session
}

describe('Most mistakes in the results', () => {
  describe('a session without mistakes (criterion 9)', () => {
    it('gives an empty list', () => {
      const { session } = setup({ questions: [C4, D4] })

      play(session, readRight, readRight)

      expect(mostMistakes(finish(session))).toEqual([])
    })
  })

  describe('in Read notes (criterion 6)', () => {
    it('gives the item of a wrong name with one mistake and the topic of the staff', () => {
      const { session } = setup({ questions: [C4] })

      play(session, readWrong)

      expect(mostMistakes(finish(session))).toEqual<ItemMistakes[]>([
        { item: { pitch: pitch('C', 4), duration: QUARTER }, count: 1, topics: ['treble-staff'] },
      ])
    })

    it('gives the item of a wrong duration with the topic of the durations', () => {
      const { session } = setup({ questions: [C4] })

      play(session, (each) => read(each, { letter: 'C', duration: HALF }))

      expect(mostMistakes(finish(session))).toEqual<ItemMistakes[]>([
        { item: { pitch: pitch('C', 4), duration: QUARTER }, count: 1, topics: ['durations'] },
      ])
    })

    it('counts every mistake on the same item', () => {
      const { session } = setup({ questions: [C4, D4] })

      play(session, readWrong, readRight, readWrong, readRight, readWrong)

      expect(counted(finish(session))).toEqual([
        { pitch: pitch('C', 4), duration: QUARTER, count: 3 },
      ])
    })

    it('tells C4 as a quarter and C4 as a half apart', () => {
      const { session } = setup({ questions: [C4, C4_HALF] })

      play(session, readWrong, readWrong)

      expect(counted(finish(session))).toEqual([
        { pitch: pitch('C', 4), duration: HALF, count: 1 },
        { pitch: pitch('C', 4), duration: QUARTER, count: 1 },
      ])
    })

    it('orders the items by the number of mistakes, then the later first (criterion 7)', () => {
      const { session } = setup({ questions: [C4, D4, C4, E4] })

      play(session, readWrong, readWrong, readWrong, readWrong)

      expect(
        counted(finish(session)).map(({ pitch: { letter }, count }) => [letter, count]),
      ).toEqual([
        ['C', 2],
        ['E', 1],
        ['D', 1],
      ])
    })

    it('gives up to five items', () => {
      const { session } = setup({ questions: [C4, D4, E4, F4, G4, A4, B4] })

      play(session, ...Array.from({ length: 7 }, () => readWrong))

      expect(counted(finish(session)).map(({ pitch: { letter } }) => letter)).toEqual([
        'B',
        'A',
        'G',
        'F',
        'E',
      ])
    })

    it('counts each wrong note of a question of several notes', () => {
      const { session } = setup({ questions: [C4_E4] })

      read(session, { letter: 'D' }, { letter: 'F' })

      expect(counted(finish(session))).toEqual([
        { pitch: pitch('E', 4), duration: QUARTER, count: 1 },
        { pitch: pitch('C', 4), duration: QUARTER, count: 1 },
      ])
    })

    it('leaves out the right notes of a question of several notes', () => {
      const { session } = setup({ questions: [C4_E4], showAnswerAtOnce: true })

      play(session, (each) => read(each, { letter: 'C' }, { letter: 'F' }))

      expect(counted(finish(session))).toEqual([
        { pitch: pitch('E', 4), duration: QUARTER, count: 1 },
      ])
    })

    it('names the item of a note without the duration asked by its pitch and the duration of the question', () => {
      const { session } = setup({ questions: [plain(note('G', 4, HALF))], difficulty: FIRST_STEPS })

      play(session, (each) => {
        each.select('A')
        each.check()
      })

      expect(counted(finish(session))).toEqual([{ pitch: pitch('G', 4), duration: HALF, count: 1 }])
    })

    it('names the item of a sharp of the key signature by its pitch as written: F♯4', () => {
      const { session } = setup({ questions: [F_IN_G_MAJOR], showAnswerAtOnce: true })

      play(session, (each) => read(each, { letter: 'F' }))

      expect(mostMistakes(finish(session))).toEqual<ItemMistakes[]>([
        {
          item: { pitch: pitch('F', 4, 1), duration: QUARTER },
          count: 1,
          topics: ['treble-staff', 'key-signatures'],
        },
      ])
    })

    it('links the same sound named otherwise to the signs: G♭ for F♯', () => {
      const { session } = setup({ questions: [F_SHARP], showAnswerAtOnce: true })

      play(session, (each) => read(each, { letter: 'G', alteration: -1, duration: HALF }))

      expect(mostMistakes(finish(session))).toEqual<ItemMistakes[]>([
        {
          item: { pitch: pitch('F', 4, 1), duration: QUARTER },
          count: 1,
          topics: ['treble-staff', 'accidentals', 'durations'],
        },
      ])
    })
  })

  describe('only the first attempt', () => {
    it('counts a question right in the second attempt as one mistake', () => {
      const { session } = setup({ questions: [C4] })

      play(session, readWrongThenRight)

      expect(counted(finish(session))).toEqual([
        { pitch: pitch('C', 4), duration: QUARTER, count: 1 },
      ])
    })

    it('counts a question wrong in both attempts as one mistake', () => {
      const { session } = setup({ questions: [C4] })

      play(session, readWrong)

      expect(counted(finish(session))).toEqual([
        { pitch: pitch('C', 4), duration: QUARTER, count: 1 },
      ])
    })

    it('takes the topics of the first attempt, not of the second', () => {
      const { session } = setup({ questions: [F_SHARP] })

      play(session, (each) => {
        // F for F♯: the place only; then G♭: the same sound named otherwise.
        read(each, { letter: 'F' })
        each.select('G')
        each.toggleFlat()
        each.check()
      })

      expect(mostMistakes(finish(session)).map(({ topics }) => topics)).toEqual([['treble-staff']])
    })

    it('counts a mistake shown with the right answer at once', () => {
      const { session } = setup({ questions: [C4], showAnswerAtOnce: true })

      play(session, readWrong)

      expect(counted(finish(session))).toEqual([
        { pitch: pitch('C', 4), duration: QUARTER, count: 1 },
      ])
    })
  })

  describe('in the quick mode', () => {
    it('counts a wrong quick answer', () => {
      const { session } = setup({ questions: [C4, D4], autoAdvance: true })

      session.answerDuration(QUARTER)
      session.answer('E')
      session.answer('D')
      session.next()
      session.answerDuration(QUARTER)
      session.answer('D')

      expect(counted(finish(session))).toEqual([
        { pitch: pitch('C', 4), duration: QUARTER, count: 1 },
      ])
    })
  })

  describe('in Write notes (criterion 6, edge case 5)', () => {
    it('gives the item of a note on another step with the topic of the staff', () => {
      const { session } = setup({ questions: [G4], exercise: 'write', showAnswerAtOnce: true })

      play(session, (each) => write(each, { at: pitch('A', 4) }))

      expect(mostMistakes(finish(session))).toEqual<ItemMistakes[]>([
        { item: { pitch: pitch('G', 4), duration: QUARTER }, count: 1, topics: ['treble-staff'] },
      ])
    })

    it('counts a sign one too many: a sharp the key signature gives already', () => {
      const { session } = setup({
        questions: [F_IN_G_MAJOR],
        exercise: 'write',
        showAnswerAtOnce: true,
      })

      play(session, (each) => write(each, { at: pitch('F', 4), accidental: 'sharp' }))

      expect(mostMistakes(finish(session))).toEqual<ItemMistakes[]>([
        {
          item: { pitch: pitch('F', 4, 1), duration: QUARTER },
          count: 1,
          topics: ['accidentals', 'key-signatures'],
        },
      ])
    })

    it('counts a needed sign left out', () => {
      const { session } = setup({ questions: [F_SHARP], exercise: 'write', showAnswerAtOnce: true })

      play(session, (each) => write(each, { at: pitch('F', 4) }))

      expect(mostMistakes(finish(session))).toEqual<ItemMistakes[]>([
        { item: { pitch: pitch('F', 4, 1), duration: QUARTER }, count: 1, topics: ['accidentals'] },
      ])
    })

    it('gives the item of a wrong duration with the topic of the durations', () => {
      const { session } = setup({ questions: [G4], exercise: 'write', showAnswerAtOnce: true })

      play(session, (each) => write(each, { at: pitch('G', 4), duration: WHOLE }))

      expect(mostMistakes(finish(session))).toEqual<ItemMistakes[]>([
        { item: { pitch: pitch('G', 4), duration: QUARTER }, count: 1, topics: ['durations'] },
      ])
    })

    it('counts only the first attempt', () => {
      const { session } = setup({ questions: [G4, E4], exercise: 'write' })

      play(
        session,
        (each) => {
          write(each, { at: pitch('A', 4) })
          each.place(pitch('B', 4))
          each.check()
        },
        writeRight,
      )

      expect(counted(finish(session))).toEqual([
        { pitch: pitch('G', 4), duration: QUARTER, count: 1 },
      ])
    })

    it('gives an empty list without mistakes', () => {
      const { session } = setup({ questions: [G4, F_IN_G_MAJOR], exercise: 'write' })

      play(session, writeRight, writeRight)

      expect(mostMistakes(finish(session))).toEqual([])
    })
  })

  describe('in every length (criterion 6)', () => {
    it('counts the mistake on the last question of a session of 10', () => {
      const { session } = setup({ questions: [C4, D4], length: 10 })

      play(session, ...Array.from({ length: 9 }, () => readRight), readWrong)
      session.next()

      expect(counted(session)).toEqual([{ pitch: pitch('D', 4), duration: QUARTER, count: 1 }])
    })

    it('counts the mistake on the last question of a session on time', () => {
      const { session, elapse } = setup({ questions: [C4, D4], length: { minutes: 3 } })

      readRight(session)
      session.next()
      elapse(3 * MINUTE)
      readWrong(session)
      session.next()

      expect(counted(session)).toEqual([{ pitch: pitch('D', 4), duration: QUARTER, count: 1 }])
    })

    it('counts the mistakes of a session on time in Write notes', () => {
      const { session, elapse } = setup({
        questions: [G4],
        exercise: 'write',
        showAnswerAtOnce: true,
        length: { minutes: 3 },
      })

      write(session, { at: pitch('A', 4) })
      elapse(3 * MINUTE)
      session.next()

      expect(counted(session)).toEqual([{ pitch: pitch('G', 4), duration: QUARTER, count: 1 }])
    })

    it('counts the mistakes before Finish without a limit', () => {
      const { session } = setup({ questions: [C4, D4] })

      play(session, readWrong, readRight)

      expect(counted(finish(session))).toEqual([
        { pitch: pitch('C', 4), duration: QUARTER, count: 1 },
      ])
    })

    it('counts a mistake when Finish comes during the second attempt', () => {
      const { session } = setup({ questions: [C4] })

      read(session, { letter: 'D' })

      expect(counted(finish(session))).toEqual([
        { pitch: pitch('C', 4), duration: QUARTER, count: 1 },
      ])
    })

    it('leaves out the question shown but not checked when Finish comes', () => {
      const { session } = setup({ questions: [C4, D4] })
      readRight(session)
      session.next()

      choose(session, { letter: 'E' })

      expect(mostMistakes(finish(session))).toEqual([])
    })
  })

  describe('a new session', () => {
    it('starts with no mistakes', () => {
      const { session } = setup({ questions: [C4, D4] })
      play(session, readWrong)
      finish(session)
      session.newSession()

      session.start('unlimited')
      session.noteDrawn()
      readRight(session)

      expect(mostMistakes(finish(session))).toEqual([])
    })
  })
})
