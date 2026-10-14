import { describe, expect, it } from 'vitest'
import type { Clock } from '@/application/ports'
import { createSession } from '@/application/session'
import type { ProgressRecorder, Session } from '@/application/session'
import { presetDifficulty, type Difficulty } from '@/domain/difficulty'
import { keyboardKeys, type PianoKey } from '@/domain/keyboard'
import { NO_KEY_SIGNATURE, type KeySignature } from '@/domain/key-signature'
import type { ItemAnswer, SavedSession } from '@/domain/progress'
import {
  applyAccidentals,
  COMMON_TIME,
  createQuestion,
  createQuestionOf,
  type Accidental,
  type Duration,
  type NoteOrRest,
  type Question,
} from '@/domain/question'
import { EMPTY_REVIEW_QUEUE } from '@/domain/review-queue'
import {
  EMPTY_SCORE,
  NO_MISTAKES,
  recordGrade,
  type Exercise,
  type NoteInput,
} from '@/domain/session'

// Feature piano-keyboard, slice 1: the note input of Read notes is taken from the preferences when
// a session starts and when a session not finished is continued, whatever it was when it was saved
// (criteria 1, 16). The session gives the screen the keys of its difficulty (criterion 5) and the
// note input. A key played chooses the pitch of the current note; in the quick mode the press that
// completes the answer checks it, as a name does (criterion 7). The score, Most mistakes and the
// statistics are as with the names; the item of a mistake is the note of the question as written
// (criterion 9).

const FIRST_STEPS = presetDifficulty('first-steps')
const CONFIDENT_READING = presetDifficulty('confident-reading')
const ADVANCED = presetDifficulty('advanced')

const QUARTER: Duration = { value: 'quarter' }
const HALF: Duration = { value: 'half' }

const G_MAJOR: KeySignature = { count: 1, accidental: 'sharp' }

const key = (number: number): PianoKey => ({ number })

const note = (
  letter: 'C' | 'D' | 'E' | 'F' | 'G',
  octave: number,
  accidental?: Accidental,
): NoteOrRest =>
  accidental
    ? { pitch: { letter, octave }, duration: QUARTER, accidental }
    : { pitch: { letter, octave }, duration: QUARTER }

// The question in its right notation, as the generator makes it: the pitch of each note is how
// it sounds.
const questionOf = (keySignature: KeySignature, ...elements: NoteOrRest[]): Question =>
  createQuestionOf(COMMON_TIME, applyAccidentals(elements, COMMON_TIME, keySignature), keySignature)

const C4 = questionOf(NO_KEY_SIGNATURE, note('C', 4))
const D4 = questionOf(NO_KEY_SIGNATURE, note('D', 4))
// F4 in G major: F♯ by the key signature, written without a sign.
const F_IN_G_MAJOR = questionOf(G_MAJOR, note('F', 4))

interface Modes {
  autoAdvance: boolean
  showAnswerAtOnce: boolean
  difficulty: Difficulty
  exercise: Exercise
  noteInput?: NoteInput
}

interface Setup extends Partial<Modes> {
  readonly questions?: readonly Question[]
}

function setup({ questions = [C4, D4], ...initial }: Setup = {}) {
  const modes: Modes = {
    autoAdvance: false,
    showAnswerAtOnce: false,
    difficulty: FIRST_STEPS,
    exercise: 'read',
    noteInput: 'keyboard',
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
    },
    undefined,
    progress,
  )
  return { session, modes, told }
}

function started(given: Setup = {}) {
  const page = setup(given)
  page.session.start('unlimited')
  page.session.noteDrawn()
  return page
}

function onQuestion(session: Session) {
  const { state } = session
  if (state.phase !== 'question') throw new Error(`expected a question, got ${state.phase}`)
  return state
}

function mostMistakes(session: Session) {
  const { state } = session
  if (state.phase !== 'results') throw new Error(`expected the results, got ${state.phase}`)
  return state.mostMistakes
}

// A session of 20 on Advanced, left on its seventh question not checked.
const SAVED: SavedSession = {
  exercise: 'read',
  length: 20,
  difficulty: ADVANCED,
  attempts: 2,
  number: 7,
  elapsedMs: 84_000,
  score: recordGrade(EMPTY_SCORE, [{ pitch: true, duration: true }], 2_000),
  mistakes: NO_MISTAKES,
  reviewQueue: EMPTY_REVIEW_QUEUE,
  question: createQuestion({ pitch: { letter: 'G', octave: 4 }, duration: QUARTER }),
  grades: null,
}

describe('the note input of a session', () => {
  it('is the keyboard when the preferences say so', () => {
    const { session } = started({ noteInput: 'keyboard' })

    expect(onQuestion(session).noteInput).toBe('keyboard')
  })

  it('is the names when the preferences say so', () => {
    const { session } = started({ noteInput: 'names' })

    expect(onQuestion(session).noteInput).toBe('names')
  })

  it('is the names when the modes give none', () => {
    const page = setup()
    delete page.modes.noteInput
    page.session.start('unlimited')

    expect(onQuestion(page.session).noteInput).toBe('names')
  })

  it('is taken on start: a change of the preferences waits for the next session', () => {
    const { session, modes } = started({ noteInput: 'keyboard' })

    modes.noteInput = 'names'

    expect(onQuestion(session).noteInput).toBe('keyboard')
  })

  it('is taken anew for the next session', () => {
    const { session, modes } = started({ noteInput: 'keyboard' })
    session.finish()

    modes.noteInput = 'names'
    session.start('unlimited')

    expect(onQuestion(session).noteInput).toBe('names')
  })

  describe('of a session continued (criterion 16)', () => {
    it('is the one of the preferences now, not the one the session was read with', () => {
      const { session } = setup({ noteInput: 'keyboard' })

      session.resume(SAVED)

      expect(onQuestion(session).noteInput).toBe('keyboard')
    })

    it('is the names when the preferences say so now', () => {
      const { session } = setup({ noteInput: 'names' })

      session.resume(SAVED)

      expect(onQuestion(session).noteInput).toBe('names')
    })

    it('gives the keys of the difficulty of the session continued', () => {
      const { session } = setup({ noteInput: 'keyboard', difficulty: FIRST_STEPS })

      session.resume(SAVED)

      expect(onQuestion(session).keys).toEqual(keyboardKeys(ADVANCED))
    })
  })
})

describe('the keys a session gives the screen (criterion 5)', () => {
  it('are those of the difficulty of the preferences', () => {
    const { session } = started({ difficulty: CONFIDENT_READING })

    expect(onQuestion(session).keys).toEqual(keyboardKeys(CONFIDENT_READING))
  })

  it('are those of the difficulty given for this session only', () => {
    const { session } = setup({ difficulty: FIRST_STEPS })

    session.start('unlimited', ADVANCED)

    expect(onQuestion(session).keys).toEqual(keyboardKeys(ADVANCED))
  })
})

describe('a key played in the normal mode', () => {
  it('chooses the key of the current note', () => {
    const { session } = started()

    session.pressKey(key(62))

    expect(onQuestion(session).trainer.key).toEqual(key(62))
  })

  it('is graded by its sound and octave with Check', () => {
    const { session } = started()

    session.pressKey(key(60))
    session.check()

    expect(onQuestion(session).trainer.outcome).toBe('correct')
    expect(onQuestion(session).score.checked).toBe(1)
  })

  it('opens the second attempt for the key an octave off', () => {
    const { session } = started()

    session.pressKey(key(72))
    session.check()

    const { trainer } = onQuestion(session)
    expect(trainer.outcome).toBeNull()
    expect(trainer.wrongKey).toEqual(key(72))
  })

  it('is not checked by answerKey outside the quick mode', () => {
    const { session } = started()

    session.answerKey(key(60))

    expect(onQuestion(session).trainer.firstGrade).toBeNull()
    expect(onQuestion(session).number).toBe(1)
  })
})

describe('a key played in the quick mode (criterion 7)', () => {
  it('answers and moves on when the duration is not asked', () => {
    const { session } = started({ autoAdvance: true })

    session.answerKey(key(60))

    const state = onQuestion(session)
    expect(state.number).toBe(2)
    expect(state.previousOutcome).toBe('correct')
    expect(state.score.checked).toBe(1)
  })

  it('stays on the question for the second attempt after a wrong key', () => {
    const { session } = started({ autoAdvance: true })

    session.answerKey(key(72))

    const state = onQuestion(session)
    expect(state.number).toBe(1)
    expect(state.trainer.wrongKey).toEqual(key(72))
  })

  describe('with the duration asked', () => {
    const quick = () =>
      started({ autoAdvance: true, difficulty: CONFIDENT_READING, questions: [C4, D4] })

    it('waits for the duration after the key', () => {
      const { session } = quick()

      session.answerKey(key(60))

      expect(onQuestion(session).trainer.firstGrade).toBeNull()
      expect(onQuestion(session).trainer.key).toEqual(key(60))
    })

    it('checks once the duration completes the answer', () => {
      const { session } = quick()

      session.answerKey(key(60))
      session.answerDuration(QUARTER)

      expect(onQuestion(session).number).toBe(2)
      expect(onQuestion(session).previousOutcome).toBe('correct')
    })

    it('checks once the key completes the answer', () => {
      const { session } = quick()

      session.answerDuration(QUARTER)
      session.answerKey(key(60))

      expect(onQuestion(session).number).toBe(2)
      expect(onQuestion(session).previousOutcome).toBe('correct')
    })
  })
})

describe('mistakes and statistics with the keyboard (criterion 9)', () => {
  it('tells the statistics a right key as a right answer to the note as written', () => {
    const { session, told } = started()

    session.pressKey(key(60))
    session.check()

    expect(told).toEqual([
      [{ item: { pitch: { letter: 'C', octave: 4 }, duration: QUARTER }, right: true }],
    ])
  })

  it('tells the statistics a wrong key as a wrong answer', () => {
    const { session, told } = started()

    session.pressKey(key(72))
    session.check()

    expect(told).toEqual([
      [{ item: { pitch: { letter: 'C', octave: 4 }, duration: QUARTER }, right: false }],
    ])
  })

  it('counts a key an octave off in Most mistakes with the topic of the staff', () => {
    const { session } = started({ questions: [C4] })
    session.pressKey(key(72))
    session.check()

    session.finish()

    expect(mostMistakes(session)).toEqual([
      {
        item: { pitch: { letter: 'C', octave: 4 }, duration: QUARTER },
        count: 1,
        topics: ['treble-staff'],
      },
    ])
  })

  it('counts the white key of a sharp of the key signature with the note as written', () => {
    const { session } = started({ questions: [F_IN_G_MAJOR], difficulty: CONFIDENT_READING })
    session.pressKey(key(65))
    session.selectDuration(QUARTER)
    session.check()

    session.finish()

    expect(mostMistakes(session)).toEqual([
      {
        item: { pitch: { letter: 'F', octave: 4, alteration: 1 }, duration: QUARTER },
        count: 1,
        topics: ['treble-staff', 'key-signatures'],
      },
    ])
  })

  it('counts a right key with a wrong duration as a mistake of the duration only', () => {
    const { session } = started({ questions: [C4], difficulty: CONFIDENT_READING })
    session.pressKey(key(60))
    session.selectDuration(HALF)
    session.check()

    session.finish()

    expect(mostMistakes(session)).toEqual([
      {
        item: { pitch: { letter: 'C', octave: 4 }, duration: QUARTER },
        count: 1,
        topics: ['durations'],
      },
    ])
  })

  it('counts no mistake for the black key of the sound of the note', () => {
    const { session } = started({ questions: [F_IN_G_MAJOR] })
    session.pressKey(key(66))
    session.check()

    session.finish()

    expect(mostMistakes(session)).toEqual([])
  })
})
