import { describe, expect, it } from 'vitest'
import type { Clock } from '@/application/ports'
import { createSession } from '@/application/session'
import type { ProgressRecorder, Session } from '@/application/session'
import { presetDifficulty, type Difficulty } from '@/domain/difficulty'
import { NO_KEY_SIGNATURE, type KeySignature } from '@/domain/key-signature'
import type { Alteration, Letter, Pitch } from '@/domain/pitch'
import type { ItemAnswer } from '@/domain/progress'
import {
  applyAccidentals,
  COMMON_TIME,
  createQuestionOf,
  type Accidental,
  type Duration,
  type NoteOrRest,
  type Question,
} from '@/domain/question'
import type { Exercise, SessionLength } from '@/domain/session'

// Feature progress-and-storage, slice 1: a session tells the answers on the items of each question
// for the statistics by item (criterion 6). Each checked question is told once, when its first
// attempt is checked, with every note of the question in its order — the rests apart — and
// whether the note was right in that attempt; the second attempt tells nothing. It is so in both
// exercises and in the quick mode.
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
const G4 = plain(note('G', 4))
// F4 in G major: F♯ by the key signature, written without a sign.
const F_IN_G_MAJOR = questionOf(G_MAJOR, note('F', 4))
// C4 and E4 in one question.
const C4_E4 = plain(note('C', 4), note('E', 4))
// C4, a quarter rest, E4.
const C4_REST_E4 = plain(note('C', 4), { duration: QUARTER }, note('E', 4))

const answered = (
  letter: Letter,
  octave: number,
  right: boolean,
  duration: Duration = QUARTER,
  alteration?: Alteration,
): ItemAnswer => ({ item: { pitch: pitch(letter, octave, alteration), duration }, right })

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
  // Each call is one question told.
  const told: (readonly ItemAnswer[])[] = []
  const progress: ProgressRecorder = {
    recordAnswers(answers) {
      told.push(answers)
    },
    recordSession() {},
    saveSession() {},
    discardSession() {},
  }
  const session = createSession(
    () => next,
    clock,
    {
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
    undefined,
    progress,
  )
  session.start(length)
  session.noteDrawn()
  return {
    session,
    told,
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

describe('the answers told for the statistics by item (criterion 6)', () => {
  describe('in Read notes', () => {
    it('tells nothing before a check', () => {
      const { session, told } = setup({ questions: [C4] })

      choose(session, { letter: 'C' })

      expect(told).toEqual([])
    })

    it('tells a right answer', () => {
      const { session, told } = setup({ questions: [C4] })

      readRight(session)

      expect(told).toEqual([[answered('C', 4, true)]])
    })

    it('tells a wrong name as a wrong answer', () => {
      const { session, told } = setup({ questions: [C4], showAnswerAtOnce: true })

      read(session, { letter: 'D' })

      expect(told).toEqual([[answered('C', 4, false)]])
    })

    it('tells a wrong duration as a wrong answer', () => {
      const { session, told } = setup({ questions: [C4], showAnswerAtOnce: true })

      read(session, { letter: 'C', duration: HALF })

      expect(told).toEqual([[answered('C', 4, false)]])
    })

    it('tells the first attempt once, the second attempt not', () => {
      const { session, told } = setup({ questions: [C4] })

      readWrongThenRight(session)

      expect(told).toEqual([[answered('C', 4, false)]])
    })

    it('tells a question wrong in both attempts once', () => {
      const { session, told } = setup({ questions: [C4] })

      read(session, { letter: 'D' })
      session.select('E')
      session.check()

      expect(told).toEqual([[answered('C', 4, false)]])
    })

    it('tells each question checked, in turn', () => {
      const { session, told } = setup({ questions: [C4, D4] })

      readRight(session)
      session.next()
      read(session, { letter: 'E' })

      expect(told).toEqual([[answered('C', 4, true)], [answered('D', 4, false)]])
    })

    it('tells every note of a question of several notes in its order', () => {
      const { session, told } = setup({ questions: [C4_E4], showAnswerAtOnce: true })

      read(session, { letter: 'C' }, { letter: 'F' })

      expect(told).toEqual([[answered('C', 4, true), answered('E', 4, false)]])
    })

    it('leaves the rests out', () => {
      const { session, told } = setup({ questions: [C4_REST_E4], showAnswerAtOnce: true })

      read(session, { letter: 'D' }, { letter: 'E' })

      expect(told).toEqual([[answered('C', 4, false), answered('E', 4, true)]])
    })

    it('names the item of a sharp of the key signature by its pitch as written: F♯4', () => {
      const { session, told } = setup({ questions: [F_IN_G_MAJOR], showAnswerAtOnce: true })

      read(session, { letter: 'F' })

      expect(told).toEqual([[answered('F', 4, false, QUARTER, 1)]])
    })

    it('names the item of a note without the duration asked by the duration of the question', () => {
      const { session, told } = setup({
        questions: [plain(note('G', 4, HALF))],
        difficulty: FIRST_STEPS,
      })

      session.select('G')
      session.check()

      expect(told).toEqual([[answered('G', 4, true, HALF)]])
    })

    it('tells nothing for a question shown but not checked when Finish comes', () => {
      const { session, told } = setup({ questions: [C4, D4] })
      readRight(session)
      session.next()

      choose(session, { letter: 'E' })
      session.finish()

      expect(told).toEqual([[answered('C', 4, true)]])
    })

    it('tells the last question of a session on time', () => {
      const { session, told, elapse } = setup({ questions: [C4, D4], length: { minutes: 3 } })
      readRight(session)
      session.next()
      elapse(3 * MINUTE)

      read(session, { letter: 'E' })
      session.next()

      expect(told).toEqual([[answered('C', 4, true)], [answered('D', 4, false)]])
    })
  })

  describe('in the quick mode', () => {
    it('tells a right quick answer once', () => {
      const { session, told } = setup({ questions: [C4, D4], autoAdvance: true })

      session.answerDuration(QUARTER)
      session.answer('C')

      expect(told).toEqual([[answered('C', 4, true)]])
    })

    it('tells a wrong quick answer once, though the second attempt is right', () => {
      const { session, told } = setup({ questions: [C4, D4], autoAdvance: true })

      session.answerDuration(QUARTER)
      session.answer('E')
      session.answer('C')

      expect(told).toEqual([[answered('C', 4, false)]])
    })
  })

  describe('in Write notes', () => {
    it('tells a right note', () => {
      const { session, told } = setup({ questions: [G4], exercise: 'write' })

      writeRight(session)

      expect(told).toEqual([[answered('G', 4, true)]])
    })

    it('tells a note on another step as a wrong answer', () => {
      const { session, told } = setup({
        questions: [G4],
        exercise: 'write',
        showAnswerAtOnce: true,
      })

      write(session, { at: pitch('A', 4) })

      expect(told).toEqual([[answered('G', 4, false)]])
    })

    it('tells a wrong duration as a wrong answer', () => {
      const { session, told } = setup({
        questions: [G4],
        exercise: 'write',
        showAnswerAtOnce: true,
      })

      write(session, { at: pitch('G', 4), duration: WHOLE })

      expect(told).toEqual([[answered('G', 4, false)]])
    })

    it('tells a sign one too many as a wrong answer on F♯4', () => {
      const { session, told } = setup({
        questions: [F_IN_G_MAJOR],
        exercise: 'write',
        showAnswerAtOnce: true,
      })

      write(session, { at: pitch('F', 4), accidental: 'sharp' })

      expect(told).toEqual([[answered('F', 4, false, QUARTER, 1)]])
    })

    it('tells the first attempt once, the second attempt not', () => {
      const { session, told } = setup({ questions: [G4], exercise: 'write' })

      write(session, { at: pitch('A', 4) })
      session.place(pitch('G', 4))
      session.check()

      expect(told).toEqual([[answered('G', 4, false)]])
    })

    it('tells a right note once in the quick mode', () => {
      const { session, told } = setup({ questions: [G4, C4], exercise: 'write', autoAdvance: true })

      writeRight(session)

      expect(told).toEqual([[answered('G', 4, true)]])
    })
  })
})
