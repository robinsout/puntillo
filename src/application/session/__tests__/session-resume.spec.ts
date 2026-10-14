import { describe, expect, it } from 'vitest'
import type { Clock, Random } from '@/application/ports'
import { createReviewQueueService } from '@/application/review-queue'
import { createSession } from '@/application/session'
import type { ProgressRecorder, Session, SessionState } from '@/application/session'
import { presetDifficulty, type Difficulty } from '@/domain/difficulty'
import { LETTERS, type Letter, type Pitch } from '@/domain/pitch'
import type { SavedSession, SessionSummary } from '@/domain/progress'
import { createQuestion, type Duration, type Question } from '@/domain/question'
import type { ReviewItem } from '@/domain/review-queue'
import type { Exercise, SessionLength } from '@/domain/session'

// Feature progress-and-storage, slice 3: a session not finished is saved, and Continue brings it
// back after a reload (criteria 8, 10–13, edge case 2).
//
// - Saving: after each check, of the first attempt and of the second, and after each move to a
//   new question; a session with no question checked is not saved, as Finish without a check
//   leaves nothing. saveProgress() saves the session as it is now, so that the time passed is
//   right when the page is hidden; it too saves nothing before the first check.
// - Discarding: the results, by any way into them, and the start of a session, Practice only these
//   included, discard what is saved.
// - resume() goes on with the score, the streak in it, the mistakes, the review queue, the
//   exercise, the difficulty, the number of attempts and the time passed of the session saved,
//   whatever the preferences say now. A question not checked opens again as it was, without the
//   choices made; a question checked, on its second attempt or its review, is left as by Next: the
//   next question opens with the number after it and the review queue takes the one checked into
//   account. If that one was the last, by its number or by the time, the results open at once and
//   the session is told for the history. The result of the last answer of the quick mode is not
//   brought back.
//
// A page is a session of its own, with its own clock, questions and review queue, over the progress
// of the browser, which keeps the session saved last. The questions of a page ask about the first
// item due, otherwise they go through the pitches of the page in turn as quarter notes; the pages
// after a reload go through other pitches than the first one, so that a question brought back is
// told from a question made anew.

const CONFIDENT_READING = presetDifficulty('confident-reading')
const FIRST_STEPS = presetDifficulty('first-steps')

const MINUTE = 60_000
const ALMOST_ONE = 1 - Number.EPSILON

const QUARTER: Duration = { value: 'quarter' }

const constant = (value: number): Random => ({ next: () => value })

const pitchesOf = (octave: number, letters: readonly Letter[] = LETTERS): readonly Pitch[] =>
  letters.map((letter): Pitch => ({ letter, octave }))

// C4 to B4 before the reload, C5 to B5 after it.
const FIRST_PAGE = pitchesOf(4)
const LATER_PAGE = pitchesOf(5)
// Within First steps, which writes no note on a ledger line.
const WRITTEN_FIRST = pitchesOf(4, ['E', 'F', 'G', 'A', 'B'])
const WRITTEN_LATER: readonly Pitch[] = [{ letter: 'C', octave: 5 }, ...pitchesOf(4, ['D'])]

function questionSource(pitches: readonly Pitch[]) {
  const difficulties: Difficulty[] = []
  let turn = 0
  const next = (due: readonly ReviewItem[] = []): Question => {
    const [first] = due
    if (first) return createQuestion({ pitch: first.pitch, duration: first.duration })
    const pitch = pitches[turn % pitches.length] as Pitch
    turn += 1
    return createQuestion({ pitch, duration: QUARTER })
  }
  return {
    questionsFor(difficulty: Difficulty) {
      difficulties.push(difficulty)
      return next
    },
    difficulties,
  }
}

// What the progress of the browser keeps of the sessions.
function browserProgress() {
  let saved: SavedSession | null = null
  const sessions: SessionSummary[] = []
  const progress: ProgressRecorder = {
    recordAnswers() {},
    recordSession(summary) {
      sessions.push(summary)
    },
    saveSession(session) {
      saved = session
    },
    discardSession() {
      saved = null
    },
  }
  return {
    progress,
    sessions,
    get saved() {
      return saved
    },
    // What Continue is given.
    unfinished(): SavedSession {
      if (!saved) throw new Error('expected a session saved')
      return saved
    },
  }
}

type Browser = ReturnType<typeof browserProgress>

interface Modes {
  autoAdvance: boolean
  showAnswerAtOnce: boolean
  difficulty: Difficulty
  exercise: Exercise
}

interface PageSetup {
  readonly modes?: Partial<Modes>
  readonly pitches?: readonly Pitch[]
  readonly random?: Random
  // The clock of a page starts anywhere: only differences between its readings count.
  readonly startAt?: number
}

function openPage(browser: Browser, setup: PageSetup = {}) {
  const { pitches = FIRST_PAGE, random = constant(0), startAt = 0 } = setup
  const modes: Modes = {
    autoAdvance: false,
    showAnswerAtOnce: false,
    difficulty: CONFIDENT_READING,
    exercise: 'read',
    ...setup.modes,
  }
  let now = startAt
  const clock: Clock = { now: () => now }
  const source = questionSource(pitches)
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
    (queue) => createReviewQueueService(random, queue),
    browser.progress,
  )
  return {
    session,
    source,
    modes,
    elapse(ms: number) {
      now += ms
    },
  }
}

// A reload: a new page over the same browser, its questions other than those of the first page.
const reload = (browser: Browser, setup: PageSetup = {}) =>
  openPage(browser, { pitches: LATER_PAGE, startAt: 5_000_000, ...setup })

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

function running(session: Session): QuestionPhase | WritingPhase {
  const { state } = session
  if (state.phase === 'question' || state.phase === 'writing') return state
  throw new Error(`expected a question, got ${state.phase}`)
}

const questionOf = (session: Session): Question => {
  const state = running(session)
  return state.phase === 'writing' ? state.writing.question : state.trainer.question
}

function soleNote(session: Session) {
  const [note, ...others] = questionOf(session).notes
  if (others.length > 0) throw new Error('expected a question of one note')
  return note
}

function shown(session: Session): string {
  return pitchText(soleNote(session).pitch)
}

const numberOf = (session: Session): number => running(session).number

const pitchText = ({ letter, octave }: Pitch) => `${letter}${octave}`

// Made by the page after the reload, not brought back from the one before it.
const isMadeAnew = (session: Session, pitches: readonly Pitch[] = LATER_PAGE): boolean =>
  pitches.map(pitchText).includes(shown(session))

const rightLetter = (session: Session): Letter => soleNote(session).pitch.letter
const wrongLetter = (session: Session): Letter => (rightLetter(session) === 'C' ? 'D' : 'C')
const anotherWrongLetter = (session: Session): Letter =>
  rightLetter(session) === 'B' || wrongLetter(session) === 'B' ? 'A' : 'B'

// The duration too when the difficulty asks for it.
function choose(session: Session, letter: Letter) {
  session.select(letter)
  if (inQuestion(session).trainer.askDuration) session.selectDuration(soleNote(session).duration)
}

function answerRight(session: Session) {
  session.noteDrawn()
  choose(session, rightLetter(session))
  session.check()
}

// The first attempt wrong on the name: the second one is open.
function answerWrongOnce(session: Session) {
  session.noteDrawn()
  choose(session, wrongLetter(session))
  session.check()
}

// Both attempts wrong on the name: the review is shown.
function answerWrongTwice(session: Session) {
  answerWrongOnce(session)
  session.select(anotherWrongLetter(session))
  session.check()
}

function answerQuickRight(session: Session) {
  session.noteDrawn()
  session.selectDuration(soleNote(session).duration)
  session.answer(rightLetter(session))
}

function writeRight(session: Session) {
  session.noteDrawn()
  const { letter, octave } = soleNote(session).pitch
  session.place({ letter, octave })
  session.check()
}

function playRight(session: Session, questions: number) {
  for (let count = 0; count < questions; count++) {
    answerRight(session)
    session.next()
  }
}

// Answers right and goes on until the question shows the pitch; the number it shows it on.
function numberShowing(session: Session, pitch: string): number | null {
  for (let count = 0; count < 20; count++) {
    if (shown(session) === pitch) return numberOf(session)
    answerRight(session)
    session.next()
  }
  return null
}

const summary = (
  length: SessionLength,
  questions: number,
  accuracy: number,
  exercise: Exercise = 'read',
): SessionSummary => ({ exercise, length, questions, accuracy })

describe('a session saved (criterion 8)', () => {
  it('is not saved before the first check', () => {
    const browser = browserProgress()
    const { session, elapse } = openPage(browser)
    session.start(20)
    session.noteDrawn()
    choose(session, 'C')
    elapse(MINUTE)

    session.saveProgress()

    expect(browser.saved).toBeNull()
  })

  it('is saved after the first check, with the question checked', () => {
    const browser = browserProgress()
    const { session } = openPage(browser)
    session.start(20)

    answerRight(session)

    expect(browser.saved).toMatchObject({
      exercise: 'read',
      length: 20,
      difficulty: CONFIDENT_READING,
      attempts: 2,
      number: 1,
      question: questionOf(session),
      grades: { first: [{ pitch: true, duration: true }], second: null },
    })
    expect(browser.unfinished().score).toEqual(inQuestion(session).score)
  })

  it('is saved after the second attempt is checked, with both grades', () => {
    const browser = browserProgress()
    const { session } = openPage(browser)
    session.start(20)

    answerWrongTwice(session)

    expect(browser.unfinished().grades).toEqual({
      first: [{ pitch: false, duration: true }],
      second: [{ pitch: false, duration: true }],
    })
  })

  it('is saved once the next question opens, not checked', () => {
    const browser = browserProgress()
    const { session } = openPage(browser)
    session.start(20)
    answerRight(session)

    session.next()

    expect(browser.saved).toMatchObject({ number: 2, question: questionOf(session), grades: null })
  })

  it('is saved once a right answer opens the next question in the quick mode', () => {
    const browser = browserProgress()
    const { session } = openPage(browser, { modes: { autoAdvance: true } })
    session.start(20)

    answerQuickRight(session)

    expect(browser.saved).toMatchObject({ number: 2, question: questionOf(session), grades: null })
  })

  it('keeps one attempt of a session started with the right answer shown at once', () => {
    const browser = browserProgress()
    const { session } = openPage(browser, { modes: { showAnswerAtOnce: true } })
    session.start(20)

    answerRight(session)

    expect(browser.unfinished().attempts).toBe(1)
  })

  it('keeps the exercise and the difficulty of a session of Write notes', () => {
    const browser = browserProgress()
    const { session } = openPage(browser, {
      modes: { exercise: 'write', difficulty: FIRST_STEPS },
      pitches: WRITTEN_FIRST,
    })
    session.start('unlimited')

    writeRight(session)

    expect(browser.saved).toMatchObject({
      exercise: 'write',
      length: 'unlimited',
      difficulty: FIRST_STEPS,
    })
  })

  describe('on request, as the page is hidden', () => {
    it('is saved with the time passed since the check', () => {
      const browser = browserProgress()
      const { session, elapse } = openPage(browser)
      session.start({ minutes: 5 })
      elapse(MINUTE)
      answerRight(session)
      elapse(24_000)

      session.saveProgress()

      expect(browser.unfinished().elapsedMs).toBe(84_000)
    })

    it('is saved with the choices of the question not kept', () => {
      const browser = browserProgress()
      const { session } = openPage(browser)
      session.start(20)
      answerRight(session)
      session.next()
      choose(session, 'C')

      session.saveProgress()

      expect(browser.saved).toMatchObject({ number: 2, grades: null })
    })

    it('saves nothing on the choice screen', () => {
      const browser = browserProgress()
      const { session } = openPage(browser)

      session.saveProgress()

      expect(browser.saved).toBeNull()
    })

    it('saves nothing in the results', () => {
      const browser = browserProgress()
      const { session } = openPage(browser)
      session.start('unlimited')
      answerRight(session)
      session.finish()

      session.saveProgress()

      expect(browser.saved).toBeNull()
    })
  })
})

describe('a session saved and then discarded (criteria 12, 13)', () => {
  it('is discarded once its questions are done', () => {
    const browser = browserProgress()
    const { session } = openPage(browser)
    session.start(10)

    playRight(session, 10)

    inResults(session)
    expect(browser.saved).toBeNull()
  })

  it('is discarded once its time is up and its last question left', () => {
    const browser = browserProgress()
    const { session, elapse } = openPage(browser)
    session.start({ minutes: 3 })
    answerRight(session)
    elapse(3 * MINUTE)

    session.next()

    inResults(session)
    expect(browser.saved).toBeNull()
  })

  it('is discarded by Finish', () => {
    const browser = browserProgress()
    const { session } = openPage(browser)
    session.start('unlimited')
    answerRight(session)
    session.next()

    session.finish()

    expect(browser.saved).toBeNull()
  })

  it('is discarded by Finish in the quick mode', () => {
    const browser = browserProgress()
    const { session } = openPage(browser, { modes: { autoAdvance: true } })
    session.start('unlimited')
    answerQuickRight(session)

    session.finish()

    expect(browser.saved).toBeNull()
  })

  it('is discarded by the start of a session on the page after it', () => {
    const browser = browserProgress()
    const before = openPage(browser)
    before.session.start(20)
    answerRight(before.session)

    const { session } = reload(browser)
    session.start(10)

    expect(browser.saved).toBeNull()
  })

  it('is not brought back by Practice only these', () => {
    const browser = browserProgress()
    const { session } = openPage(browser)
    session.start('unlimited')
    answerWrongTwice(session)
    session.finish()

    session.practiceMostMistakes()

    expect(browser.saved).toBeNull()
    answerRight(session)
    expect(browser.unfinished().score.checked).toBe(1)
  })
})

describe('Continue (criterion 10)', () => {
  describe('on a question not checked', () => {
    function leftOnQuestionThree() {
      const browser = browserProgress()
      const before = openPage(browser)
      before.session.start(20)
      answerRight(before.session)
      before.session.next()
      answerWrongTwice(before.session)
      before.session.next()
      before.session.noteDrawn()
      choose(before.session, wrongLetter(before.session))
      return { browser, before: inQuestion(before.session) }
    }

    it('opens the same question with the same number', () => {
      const { browser, before } = leftOnQuestionThree()
      const { session } = reload(browser)

      session.resume(browser.unfinished())

      expect(inQuestion(session).trainer.question).toEqual(before.trainer.question)
      expect(numberOf(session)).toBe(3)
      expect(inQuestion(session).length).toBe(20)
    })

    it('opens it without the choices made', () => {
      const { browser } = leftOnQuestionThree()
      const { session } = reload(browser)

      session.resume(browser.unfinished())

      const { trainer } = inQuestion(session)
      expect(trainer.selected).toBeNull()
      expect(trainer.selectedDuration).toBeNull()
      expect(trainer.firstGrade).toBeNull()
      expect(trainer.outcome).toBeNull()
    })

    it('goes on with the score', () => {
      const { browser, before } = leftOnQuestionThree()
      const { session } = reload(browser)

      session.resume(browser.unfinished())

      expect(inQuestion(session).score).toEqual(before.score)
    })

    it('asks the page for the questions after it', () => {
      const { browser } = leftOnQuestionThree()
      const { session } = reload(browser)
      session.resume(browser.unfinished())

      answerRight(session)
      session.next()

      expect(numberOf(session)).toBe(4)
      expect(isMadeAnew(session)).toBe(true)
    })
  })

  describe('on a question checked', () => {
    it('opens the next question after one answered right', () => {
      const browser = browserProgress()
      const before = openPage(browser)
      before.session.start(20)
      answerRight(before.session)
      const { score } = inQuestion(before.session)
      const { session } = reload(browser)

      session.resume(browser.unfinished())

      expect(numberOf(session)).toBe(2)
      expect(isMadeAnew(session)).toBe(true)
      expect(inQuestion(session).trainer.firstGrade).toBeNull()
      expect(inQuestion(session).score).toEqual(score)
    })

    it('opens the next question after one waiting for its second attempt', () => {
      const browser = browserProgress()
      const before = openPage(browser)
      before.session.start(20)
      answerWrongOnce(before.session)
      const { session } = reload(browser)

      session.resume(browser.unfinished())

      expect(numberOf(session)).toBe(2)
      expect(inQuestion(session).score.checked).toBe(1)
      expect(inQuestion(session).score.points).toBe(1)
    })

    it('opens the next question after one showing its review', () => {
      const browser = browserProgress()
      const before = openPage(browser)
      before.session.start(20)
      answerWrongTwice(before.session)
      const { session } = reload(browser)

      session.resume(browser.unfinished())

      expect(numberOf(session)).toBe(2)
      expect(inQuestion(session).trainer.outcome).toBeNull()
    })

    it('saves the question it opens', () => {
      const browser = browserProgress()
      const before = openPage(browser)
      before.session.start(20)
      answerRight(before.session)
      const { session } = reload(browser)

      session.resume(browser.unfinished())

      expect(browser.saved).toMatchObject({
        number: 2,
        question: questionOf(session),
        grades: null,
      })
    })

    it('opens the results at once after the last question of its number', () => {
      const browser = browserProgress()
      const before = openPage(browser)
      before.session.start(10)
      playRight(before.session, 9)
      answerWrongTwice(before.session)
      const { session } = reload(browser)

      session.resume(browser.unfinished())

      expect(inResults(session).score.checked).toBe(10)
      // 19 points of 20.
      expect(browser.sessions).toEqual([summary(10, 10, 95)])
      expect(browser.saved).toBeNull()
    })

    it('opens the results at once after the last question of its time', () => {
      const browser = browserProgress()
      const before = openPage(browser)
      before.session.start({ minutes: 3 })
      before.elapse(3 * MINUTE)
      answerRight(before.session)
      const { session } = reload(browser)

      session.resume(browser.unfinished())

      expect(inResults(session).score.checked).toBe(1)
      expect(browser.sessions).toEqual([summary({ minutes: 3 }, 1, 100)])
      expect(browser.saved).toBeNull()
    })
  })

  it('goes on with the streak', () => {
    const browser = browserProgress()
    const before = openPage(browser)
    before.session.start('unlimited')
    answerWrongTwice(before.session)
    before.session.next()
    playRight(before.session, 2)
    const { session } = reload(browser)
    session.resume(browser.unfinished())

    answerRight(session)

    expect(inQuestion(session).score.streak).toBe(3)
    expect(inQuestion(session).score.bestStreak).toBe(3)
  })

  it('goes on with the mistakes', () => {
    const browser = browserProgress()
    const before = openPage(browser)
    before.session.start('unlimited')
    answerWrongTwice(before.session)
    before.session.next()
    const { session } = reload(browser)
    session.resume(browser.unfinished())
    answerWrongTwice(session)

    session.finish()

    expect(inResults(session).mostMistakes.map(({ item, count }) => [item, count])).toEqual([
      [{ pitch: { letter: 'D', octave: 4 }, duration: QUARTER }, 1],
      [{ pitch: { letter: 'C', octave: 4 }, duration: QUARTER }, 1],
    ])
  })

  it('tells the history of the whole session once finished', () => {
    const browser = browserProgress()
    const before = openPage(browser)
    before.session.start('unlimited')
    answerWrongTwice(before.session)
    before.session.next()
    const { session } = reload(browser)
    session.resume(browser.unfinished())
    answerRight(session)

    session.finish()

    // 3 points of 4.
    expect(browser.sessions).toEqual([summary('unlimited', 2, 75)])
  })

  describe('the review queue', () => {
    it('brings back an item due on a question after the reload', () => {
      const browser = browserProgress()
      const before = openPage(browser)
      before.session.start('unlimited')
      answerWrongTwice(before.session)
      before.session.next()
      const { session } = reload(browser)

      session.resume(browser.unfinished())

      // Wrong on question 1, it comes back 3 questions later.
      expect(numberShowing(session, 'C4')).toBe(4)
    })

    it('takes into account the question checked before the reload', () => {
      const browser = browserProgress()
      const before = openPage(browser, { random: constant(ALMOST_ONE) })
      before.session.start('unlimited')
      answerWrongTwice(before.session)
      const { session } = reload(browser, { random: constant(ALMOST_ONE) })

      session.resume(browser.unfinished())

      // Wrong in both attempts on question 1, it comes back within 5 questions, not 10.
      expect(numberShowing(session, 'C4')).toBe(6)
    })
  })

  describe('the difficulty and the attempts of the session (edge case 2)', () => {
    it('goes on with the difficulty of the session, not the one chosen since', () => {
      const browser = browserProgress()
      const before = openPage(browser, { modes: { difficulty: FIRST_STEPS } })
      before.session.start('unlimited')
      answerRight(before.session)
      const later = reload(browser, { modes: { difficulty: CONFIDENT_READING } })

      later.session.resume(browser.unfinished())

      expect(inQuestion(later.session).trainer.askDuration).toBe(false)
      expect(later.source.difficulties.at(-1)).toEqual(FIRST_STEPS)
      expect(later.modes.difficulty).toBe(CONFIDENT_READING)
    })

    it('saves the difficulty of the session on', () => {
      const browser = browserProgress()
      const before = openPage(browser, { modes: { difficulty: FIRST_STEPS } })
      before.session.start('unlimited')
      answerRight(before.session)
      const { session } = reload(browser)
      session.resume(browser.unfinished())

      answerRight(session)

      expect(browser.unfinished().difficulty).toEqual(FIRST_STEPS)
    })

    it('goes on with one attempt, the right answer shown at once', () => {
      const browser = browserProgress()
      const before = openPage(browser, { modes: { showAnswerAtOnce: true } })
      before.session.start('unlimited')
      answerRight(before.session)
      const { session } = reload(browser, { modes: { showAnswerAtOnce: false } })
      session.resume(browser.unfinished())

      answerWrongOnce(session)

      expect(inQuestion(session).trainer.outcome).toBe('incorrect')
    })

    it('goes on with two attempts', () => {
      const browser = browserProgress()
      const before = openPage(browser)
      before.session.start('unlimited')
      answerRight(before.session)
      const { session } = reload(browser, { modes: { showAnswerAtOnce: true } })
      session.resume(browser.unfinished())

      answerWrongOnce(session)

      expect(inQuestion(session).trainer.outcome).toBeNull()
      expect(inQuestion(session).trainer.firstGrade).not.toBeNull()
    })
  })

  describe('in Write notes', () => {
    it('goes on writing, whatever the exercise chosen since', () => {
      const browser = browserProgress()
      const before = openPage(browser, {
        modes: { exercise: 'write', difficulty: FIRST_STEPS },
        pitches: WRITTEN_FIRST,
      })
      before.session.start('unlimited')
      writeRight(before.session)
      before.session.next()
      const { question } = inWriting(before.session).writing
      before.session.noteDrawn()
      before.session.place({ letter: 'B', octave: 4 })
      const { session } = reload(browser, {
        modes: { exercise: 'read', difficulty: CONFIDENT_READING },
        pitches: WRITTEN_LATER,
      })

      session.resume(browser.unfinished())

      const { writing, number } = inWriting(session)
      expect(writing.question).toEqual(question)
      expect(number).toBe(2)
      expect(writing.placed).toBeNull()
    })

    it('opens the next question after one checked', () => {
      const browser = browserProgress()
      const before = openPage(browser, {
        modes: { exercise: 'write', difficulty: FIRST_STEPS },
        pitches: WRITTEN_FIRST,
      })
      before.session.start('unlimited')
      writeRight(before.session)
      const { session } = reload(browser, { pitches: WRITTEN_LATER })

      session.resume(browser.unfinished())

      expect(inWriting(session).number).toBe(2)
      expect(isMadeAnew(session, WRITTEN_LATER)).toBe(true)
    })
  })

  describe('the time (criterion 11)', () => {
    it('goes on from the time saved, not the time the page was closed', () => {
      const browser = browserProgress()
      const before = openPage(browser)
      before.session.start({ minutes: 5 })
      before.elapse(84_000)
      answerRight(before.session)
      before.elapse(10 * MINUTE)
      const later = reload(browser)

      later.session.resume(browser.unfinished())

      expect(running(later.session).elapsedMs).toBe(84_000)
      later.elapse(1_000)
      expect(running(later.session).elapsedMs).toBe(85_000)
    })

    it('goes on from the time saved on request', () => {
      const browser = browserProgress()
      const before = openPage(browser)
      before.session.start({ minutes: 5 })
      answerRight(before.session)
      before.session.next()
      before.elapse(84_000)
      before.session.saveProgress()
      const later = reload(browser)

      later.session.resume(browser.unfinished())

      expect(running(later.session).elapsedMs).toBe(84_000)
    })

    it('opens the last question again when the time was up before it was checked', () => {
      const browser = browserProgress()
      const before = openPage(browser)
      before.session.start({ minutes: 3 })
      answerRight(before.session)
      before.session.next()
      before.elapse(3 * MINUTE)
      before.session.saveProgress()
      const { session } = reload(browser)
      session.resume(browser.unfinished())

      expect(inQuestion(session).isLast).toBe(true)
      answerRight(session)
      session.next()

      expect(browser.sessions).toEqual([summary({ minutes: 3 }, 2, 100)])
    })
  })

  describe('the quick mode', () => {
    it('does not bring back the result of the last answer', () => {
      const browser = browserProgress()
      const before = openPage(browser, { modes: { autoAdvance: true } })
      before.session.start('unlimited')
      answerQuickRight(before.session)
      expect(inQuestion(before.session).previousOutcome).toBe('correct')
      const { session } = reload(browser, { modes: { autoAdvance: true } })

      session.resume(browser.unfinished())

      expect(inQuestion(session).previousOutcome).toBeNull()
      expect(numberOf(session)).toBe(2)
    })
  })
})
