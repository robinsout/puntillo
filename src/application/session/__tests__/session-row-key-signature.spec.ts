import { describe, expect, it } from 'vitest'
import type { Clock, Random } from '@/application/ports'
import { createQuestionGenerator } from '@/application/question-generation'
import { createReviewQueueService } from '@/application/review-queue'
import { createSession } from '@/application/session'
import type { ProgressRecorder, Session, SessionState } from '@/application/session'
import { presetDifficulty, type Difficulty } from '@/domain/difficulty'
import { keySignatureLetters, type KeySignature } from '@/domain/key-signature'
import type { Letter, Pitch } from '@/domain/pitch'
import type { SavedSession } from '@/domain/progress'
import { COMMON_TIME, createQuestionOf, type Duration, type Question } from '@/domain/question'
import type { ReviewItem } from '@/domain/review-queue'
import type { Exercise, SessionLength } from '@/domain/session'

// Feature staff-progress-row, slice 1, criterion 12: in Read notes with questions of one note the
// key signature is picked once for a row of ten questions — questions 1–10 of the session, 11–20
// and so on — and is the same on all ten. The session asks the generator for a key on the first
// question of a row and gives it the key of the question before on the other nine: in a session
// on time or without a limit, in the quick mode, after a reload and in Practice only these alike.
// Questions of several notes and Write notes keep a key of their own for each question (edge
// case 1). An item of the review queue due within a row is given to the generator with the key of
// the row (edge case 2).
//
// The question source stands for the generator: it takes the key it is given, otherwise the next
// key of its own in turn, and asks about the first due item, otherwise about its notes in turn.
// Its notes are on letters none of its keys alters, so that the right answer is the letter alone.

const ONE_SHARP: KeySignature = { count: 1, accidental: 'sharp' }
const TWO_FLATS: KeySignature = { count: 2, accidental: 'flat' }
const TWO_SHARPS: KeySignature = { count: 2, accidental: 'sharp' }
const ONE_FLAT: KeySignature = { count: 1, accidental: 'flat' }
const NO_SIGNS: KeySignature = { count: 0 }
const KEYS: readonly KeySignature[] = [ONE_SHARP, TWO_FLATS, TWO_SHARPS, ONE_FLAT, NO_SIGNS]

const constant = (value: number): Random => ({ next: () => value })

// First steps asks one note and no duration; here with key signatures.
const ONE_NOTE: Difficulty = { ...presetDifficulty('first-steps'), keySignatures: 2 }
const ONE_BAR = presetDifficulty('confident-reading')
const TWO_TO_FOUR: Difficulty = { ...ONE_NOTE, questionLength: 'two-to-four-notes' }

const QUARTER: Duration = { value: 'quarter' }

const PITCHES: readonly Pitch[] = (['A', 'G', 'D'] as const).map((letter) => ({
  letter,
  octave: 4,
}))

interface Asked {
  readonly due: readonly ReviewItem[]
  readonly keySignature: KeySignature | undefined
}

// keysFrom: where in KEYS its own keys start, so that two pages pick different ones.
function questionSource(keysFrom = 0) {
  const asked: Asked[] = []
  let keyTurn = keysFrom
  let turn = 0
  const next = (
    due: readonly ReviewItem[] = [],
    options: { keySignature?: KeySignature } = {},
  ): Question => {
    asked.push({ due, keySignature: options.keySignature })
    let { keySignature } = options
    if (!keySignature) {
      keySignature = KEYS[keyTurn % KEYS.length] as KeySignature
      keyTurn += 1
    }
    const [first] = due
    if (first) return createQuestionOf(COMMON_TIME, [{ ...first }], keySignature)
    const pitch = PITCHES[turn % PITCHES.length] as Pitch
    turn += 1
    return createQuestionOf(COMMON_TIME, [{ pitch, duration: QUARTER }], keySignature)
  }
  return {
    questionsFor: () => next,
    asked,
    keysGiven: () => asked.map(({ keySignature }) => keySignature),
  }
}

interface Modes {
  autoAdvance: boolean
  showAnswerAtOnce: boolean
  difficulty: Difficulty
  exercise: Exercise
}

// What the progress of the browser keeps of the session not finished.
function browserProgress() {
  let saved: SavedSession | null = null
  const progress: ProgressRecorder = {
    recordAnswers() {},
    recordSession() {},
    saveSession(session) {
      saved = session
    },
    discardSession() {
      saved = null
    },
  }
  return {
    progress,
    unfinished(): SavedSession {
      if (!saved) throw new Error('expected a session saved')
      return saved
    },
  }
}

type Browser = ReturnType<typeof browserProgress>

interface PageSetup {
  readonly modes?: Partial<Modes>
  readonly keysFrom?: number
  readonly browser?: Browser
}

function openPage(setup: PageSetup = {}) {
  const { keysFrom = 0, browser = browserProgress() } = setup
  const modes: Modes = {
    autoAdvance: false,
    showAnswerAtOnce: false,
    difficulty: ONE_NOTE,
    exercise: 'read',
    ...setup.modes,
  }
  const clock: Clock = { now: () => 0 }
  const source = questionSource(keysFrom)
  const session = createSession(
    source.questionsFor,
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
    (queue) => createReviewQueueService(constant(0), queue),
    browser.progress,
  )
  return {
    session,
    source,
    browser,
  }
}

type QuestionPhase = Extract<SessionState, { phase: 'question' }>
type WritingPhase = Extract<SessionState, { phase: 'writing' }>

function running(session: Session): QuestionPhase | WritingPhase {
  const { state } = session
  if (state.phase === 'question' || state.phase === 'writing') return state
  throw new Error(`expected a question, got ${state.phase}`)
}

const questionOf = (session: Session): Question => {
  const state = running(session)
  return state.phase === 'writing' ? state.writing.question : state.trainer.question
}

const keyOf = (session: Session): KeySignature => questionOf(session).keySignature

function soleNote(session: Session) {
  const [note, ...others] = questionOf(session).notes
  if (others.length > 0) throw new Error('expected a question of one note')
  return note
}

const rightLetter = (session: Session): Letter => soleNote(session).pitch.letter
const wrongLetter = (session: Session): Letter => (rightLetter(session) === 'C' ? 'E' : 'C')

// The sign too, where the note sounds altered, and the duration when the difficulty asks for it.
function choose(session: Session, letter: Letter) {
  const state = running(session)
  if (state.phase !== 'question') throw new Error('expected reading')
  session.select(letter)
  const { alteration } = soleNote(session).pitch
  if (letter === rightLetter(session) && alteration === 1) session.toggleSharp()
  if (letter === rightLetter(session) && alteration === -1) session.toggleFlat()
  if (state.trainer.askDuration) session.selectDuration(soleNote(session).duration)
}

function answerRight(session: Session) {
  session.noteDrawn()
  if (running(session).phase === 'writing') {
    const { letter, octave } = soleNote(session).pitch
    session.place({ letter, octave })
  } else {
    choose(session, rightLetter(session))
  }
  session.check()
}

// Wrong in the first attempt, right in the second.
function answerWrongThenRight(session: Session) {
  session.noteDrawn()
  choose(session, wrongLetter(session))
  session.check()
  choose(session, rightLetter(session))
  session.check()
}

type Answer = (session: Session) => void

// Answers each question up to the last one, by the plan or else right, and moves on after each but
// the last; gives the key of each question shown, from the current one on.
function play(session: Session, last: number, plan: Record<number, Answer> = {}): KeySignature[] {
  const keys: KeySignature[] = []
  for (;;) {
    const { number } = running(session)
    keys.push(keyOf(session))
    ;(plan[number] ?? answerRight)(session)
    if (number >= last) return keys
    session.next()
  }
}

const repeat = <T>(value: T, times: number): T[] => Array.from({ length: times }, () => value)

// The key given on each question of a row: none on the first, the key of the row after.
const rowGiven = (key: KeySignature, questions = 10): (KeySignature | undefined)[] => [
  undefined,
  ...repeat(key, questions - 1),
]

describe('the key signature of a row of questions of one note', () => {
  it('is picked on questions 1, 11 and 21 and given on the others of their row', () => {
    const { session, source } = openPage()
    session.start(50)

    play(session, 25)

    expect(source.keysGiven()).toEqual([
      ...rowGiven(ONE_SHARP),
      ...rowGiven(TWO_FLATS),
      ...rowGiven(TWO_SHARPS, 5),
    ])
  })

  it('is the same on all ten questions of a row', () => {
    const { session } = openPage()
    session.start(20)

    const keys = play(session, 20)

    expect(keys).toEqual([...repeat(ONE_SHARP, 10), ...repeat(TWO_FLATS, 10)])
  })

  it('stays the key of the row after a wrong answer', () => {
    const { session } = openPage()
    session.start(10)

    const keys = play(session, 10, { 3: answerWrongThenRight, 4: answerWrongThenRight })

    expect(keys).toEqual(repeat(ONE_SHARP, 10))
  })

  it.each<[string, SessionLength]>([
    ['on time', { minutes: 10 }],
    ['without a limit', 'unlimited'],
  ])('goes by rows of ten in a session %s', (_, length) => {
    const { session, source } = openPage()
    session.start(length)

    play(session, 12)

    expect(source.keysGiven()).toEqual([...rowGiven(ONE_SHARP), ...rowGiven(TWO_FLATS, 2)])
  })

  it('goes by rows in the quick mode', () => {
    const { session, source } = openPage({ modes: { autoAdvance: true } })
    session.start(20)

    for (let count = 0; count < 11; count++) {
      session.noteDrawn()
      session.answer(rightLetter(session))
    }

    expect(running(session).number).toBe(12)
    expect(source.keysGiven()).toEqual([...rowGiven(ONE_SHARP), ...rowGiven(TWO_FLATS, 2)])
  })

  it('starts anew with a new session', () => {
    const { session, source } = openPage()
    session.start(20)
    play(session, 4)
    session.finish()
    session.newSession()

    session.start(20)
    play(session, 2)

    expect(source.keysGiven()).toEqual([...rowGiven(ONE_SHARP, 4), ...rowGiven(TWO_FLATS, 2)])
  })
})

// Edge case 1.
describe('a key signature for each question, as before', () => {
  it.each<[string, Difficulty]>([
    ['of one bar', ONE_BAR],
    ['of two to four notes', TWO_TO_FOUR],
  ])('is picked on every question %s', (_, difficulty) => {
    const { session, source } = openPage({ modes: { difficulty } })
    session.start(20)

    play(session, 12)

    expect(source.keysGiven()).toEqual(repeat(undefined, 12))
  })

  it('is picked on every question in Write notes', () => {
    const { session, source } = openPage({ modes: { exercise: 'write' } })
    session.start(20)

    play(session, 12)

    expect(source.keysGiven()).toEqual(repeat(undefined, 12))
  })
})

// Edge case 2.
describe('an item of the review queue due within a row', () => {
  it('is given to the generator with the key of the row', () => {
    const { session, source } = openPage()
    session.start(20)

    // Wrong on question 2: with the earliest return the item is due on question 5.
    const keys = play(session, 6, { 2: answerWrongThenRight })

    const asked = source.asked[4]
    expect(asked?.due.map(({ pitch }) => pitch)).toEqual([{ letter: 'G', octave: 4 }])
    expect(asked?.keySignature).toEqual(ONE_SHARP)
    expect(keys).toEqual(repeat(ONE_SHARP, 6))
  })

  it('due on the first question of a row is given without a key, as the row has none yet', () => {
    const { session, source } = openPage()
    session.start(20)

    // Wrong on question 8: due on question 11.
    play(session, 11, { 8: answerWrongThenRight })

    expect(source.asked[10]?.due).not.toEqual([])
    expect(source.asked[10]?.keySignature).toBeUndefined()
  })
})

describe('Practice only these', () => {
  it('starts with a row of its own: the items due on the first question are given no key, the next ones the key of the row', () => {
    const { session, source } = openPage()
    session.start(10)
    play(session, 10, { 2: answerWrongThenRight, 3: answerWrongThenRight })
    session.next()
    const before = source.asked.length

    session.practiceMostMistakes()
    play(session, 3)

    const practice = source.asked.slice(before)
    expect(practice.map(({ keySignature }) => keySignature)).toEqual([
      undefined,
      TWO_FLATS,
      TWO_FLATS,
    ])
    expect(practice[0]?.due).toHaveLength(2)
    expect(practice[1]?.due).toHaveLength(1)
  })
})

// Edge case 5 and criterion 13: after a reload the row goes on in its key.
describe('a session resumed', () => {
  // The page after the reload picks its own keys from another place, so that a key of the row is
  // told from one picked anew.
  const reload = (browser: Browser) => openPage({ browser, keysFrom: 3 })

  it('gives the key of the question brought back to the next question of its row', () => {
    const first = openPage()
    first.session.start(20)
    play(first.session, 3)
    first.session.next()
    const saved = first.browser.unfinished()
    expect(saved.number).toBe(4)
    expect(saved.grades).toBeNull()

    const later = reload(first.browser)
    later.session.resume(saved)
    expect(keyOf(later.session)).toEqual(ONE_SHARP)
    answerRight(later.session)
    later.session.next()

    expect(later.source.keysGiven()).toEqual([ONE_SHARP])
    expect(keyOf(later.session)).toEqual(ONE_SHARP)
  })

  it('gives the key of the question checked to the question after it within the row', () => {
    const first = openPage()
    first.session.start(20)
    play(first.session, 5)
    const saved = first.browser.unfinished()
    expect(saved.grades).not.toBeNull()

    const later = reload(first.browser)
    later.session.resume(saved)

    expect(running(later.session).number).toBe(6)
    expect(later.source.keysGiven()).toEqual([ONE_SHARP])
    expect(keyOf(later.session)).toEqual(ONE_SHARP)
  })

  it('picks a key anew on the first question of the next row after the last one of a row', () => {
    const first = openPage()
    first.session.start(20)
    play(first.session, 10)
    const saved = first.browser.unfinished()

    const later = reload(first.browser)
    later.session.resume(saved)

    expect(running(later.session).number).toBe(11)
    expect(later.source.keysGiven()).toEqual([undefined])
    expect(keyOf(later.session)).toEqual(ONE_FLAT)
  })

  it('picks a key anew after the last question of a row brought back unchecked', () => {
    const first = openPage()
    first.session.start(20)
    play(first.session, 9)
    first.session.next()
    const saved = first.browser.unfinished()
    expect(saved.number).toBe(10)

    const later = reload(first.browser)
    later.session.resume(saved)
    answerRight(later.session)
    later.session.next()

    expect(later.source.keysGiven()).toEqual([undefined])
    expect(keyOf(later.session)).toEqual(ONE_FLAT)
  })
})

// With the generator itself: a due item the key of the row cannot express waits, without signs
// before the notes, and is asked about on the first question whose row key expresses it.
describe('a session of one note with the generator', () => {
  const WITHOUT_SIGNS: Difficulty = { ...ONE_NOTE, accidentals: 'none' }

  const alterationIn = (keySignature: KeySignature, letter: Letter): Pitch['alteration'] => {
    if (keySignature.count === 0 || !keySignatureLetters(keySignature).includes(letter))
      return undefined
    return keySignature.accidental === 'sharp' ? 1 : -1
  }

  const isSameNote = (one: Pitch, other: Pitch) =>
    one.letter === other.letter &&
    one.octave === other.octave &&
    one.alteration === other.alteration

  function generatedSession(seed: number) {
    let state = seed >>> 0
    // mulberry32: a deterministic seeded generator.
    const random: Random = {
      next() {
        state = (state + 0x6d2b79f5) >>> 0
        let t = state
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      },
    }
    const session = createSession(
      (difficulty) => createQuestionGenerator(random, difficulty),
      { now: () => 0 },
      {
        difficulty: WITHOUT_SIGNS,
        exercise: 'read',
        autoAdvance: false,
        showAnswerAtOnce: false,
        chooseAutoAdvance() {},
        chooseShowAnswerAtOnce() {},
      },
      (queue) => createReviewQueueService(constant(0), queue),
    )
    session.start('unlimited')
    return session
  }

  it('keeps the key of each row with an item due in it', () => {
    let waited = false
    for (let seed = 1; seed <= 20; seed++) {
      const session = generatedSession(seed)
      const shown: { key: KeySignature; pitch: Pitch }[] = []
      for (let number = 1; number <= 60; number++) {
        shown.push({ key: keyOf(session), pitch: soleNote(session).pitch })
        // Wrong on the last question of the first row: due on question 13, in the second row.
        if (number === 10) answerWrongThenRight(session)
        else answerRight(session)
        session.next()
      }

      for (let row = 0; row < 6; row++) {
        const keys = shown.slice(row * 10, row * 10 + 10).map(({ key }) => key)
        expect(keys).toEqual(repeat(keys[0], 10))
      }

      const missed = shown[9]?.pitch as Pitch
      // Asked by chance before it is due, it is due later.
      if (shown.slice(10, 12).some(({ pitch }) => isSameNote(pitch, missed))) continue
      const expressed = shown.findIndex(
        ({ key }, index) => index >= 12 && alterationIn(key, missed.letter) === missed.alteration,
      )
      const back = shown.findIndex(({ pitch }, index) => index >= 12 && isSameNote(pitch, missed))
      // Never expressed, it is never asked: both are -1.
      expect(back).toBe(expressed)
      if (expressed >= 20) waited = true
    }
    expect(waited).toBe(true)
  })
})
