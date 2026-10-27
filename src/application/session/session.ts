import {
  allowedPitches,
  isSameDifficulty,
  presetDifficulty,
  type Difficulty,
} from '@/domain/difficulty'
import { keyboardKeys, type PianoKey } from '@/domain/keyboard'
import type { Letter, Pitch } from '@/domain/pitch'
import type { ItemAnswer, SavedSession, SessionSummary } from '@/domain/progress'
import { DURATION_VALUES, isNoteRight } from '@/domain/question'
import type { Duration, Grade, Note, NoteGrade, Question } from '@/domain/question'
import {
  accuracyPercent,
  EMPTY_SCORE,
  isLastQuestion,
  isTimeUp,
  mostMistakes,
  NO_MISTAKES,
  recordGrade,
  recordMistakes,
} from '@/domain/session'
import type {
  Exercise,
  ItemMistakes,
  Mistake,
  Mistakes,
  NoteInput,
  Score,
  SessionLength,
} from '@/domain/session'
import { EMPTY_REVIEW_QUEUE, reviewQueueOf, type ReviewQueue } from '@/domain/review-queue'
import { readingMistakeTopics, writingMistakeTopics, type WikiTopic } from '@/domain/wiki'
import type { Clock, VisitCounter } from '@/application/ports'
import type { Preferences } from '@/application/preferences'
import type { QuestionGenerator } from '@/application/question-generation'
import type { ReviewQueueService } from '@/application/review-queue'
import { createTrainer, createWritingTrainer, hasPitch, noteAnswerOf } from '@/application/trainer'
import type {
  NoteChoice,
  Outcome,
  Trainer,
  TrainerState,
  WritingTrainer,
  WritingTrainerState,
  WrittenChoice,
} from '@/application/trainer'

// A note of a question passed in the row, right or not by its first attempt.
export interface PassedNote {
  readonly note: Note
  readonly right: boolean
}

// What the difficulty may draw in a row, so that the row is laid out the same whatever is shown.
export interface RowSlots {
  // The most signs of a key signature.
  readonly keySignatures: number
  // A sign before a note, of the key signature or an accidental.
  readonly signs: boolean
  readonly flags: boolean
}

// In Read notes with questions of one note: the questions of the row before the current one.
export interface Row {
  readonly passed: readonly PassedNote[]
  // The last row of a session of a number of questions, which ends the session.
  readonly final: boolean
  readonly slots: RowSlots
  // The lowest note the difficulty may ask, so that what stands below the row keeps its place.
  readonly lowest: Pitch
}

export type SessionState =
  | { readonly phase: 'choosing' }
  | {
      readonly phase: 'question'
      readonly length: SessionLength
      readonly number: number
      // Since the start of the session.
      readonly elapsedMs: number
      readonly score: Score
      readonly isLast: boolean
      readonly trainer: TrainerState
      readonly durations: readonly Duration['value'][]
      readonly dots: boolean
      readonly sharpsAndFlats: boolean
      readonly noteInput: NoteInput
      // From the lowest to the highest a question of the difficulty can sound.
      readonly keys: readonly PianoKey[]
      // In the quick mode the result of an answer is shown on the question after it.
      readonly previousOutcome: Outcome | null
      readonly row: Row | null
    }
  | {
      readonly phase: 'writing'
      readonly length: SessionLength
      readonly number: number
      // Since the start of the session.
      readonly elapsedMs: number
      readonly score: Score
      readonly isLast: boolean
      readonly writing: WritingTrainerState
      readonly durations: readonly Duration['value'][]
      readonly dots: boolean
      // Sharp, Flat and Natural, all three, so that the natural alone gives nothing away.
      readonly signs: boolean
      // In the quick mode the result of an answer is shown on the question after it.
      readonly previousOutcome: Outcome | null
    }
  | {
      readonly phase: 'results'
      readonly score: Score
      readonly mostMistakes: readonly ItemMistakes[]
    }

export interface Session {
  readonly state: SessionState
  readonly autoAdvance: boolean
  setAutoAdvance(on: boolean): void
  readonly showAnswerAtOnce: boolean
  setShowAnswerAtOnce(on: boolean): void
  noteDrawn(): void
  // A difficulty given here is for this session only: the preferences keep theirs.
  start(length: SessionLength, difficulty?: Difficulty): void
  select(letter: Letter): void
  pressKey(key: PianoKey): void
  selectDuration(duration: Duration): void
  toggleDot(): void
  toggleSharp(): void
  toggleFlat(): void
  toggleNatural(): void
  check(): void
  answer(letter: Letter): void
  answerKey(key: PianoKey): void
  // A note heard by the microphone: it answers the current note, and the last one checks the
  // question with no Check.
  playNote(key: PianoKey): void
  answerDuration(duration: Duration): void
  previousNote(): void
  nextNote(): void
  goToNote(index: number): void
  // Writing a note: a touch writes it on the nearest allowed step, a step moves it. With an index,
  // the touch is in the column of that note, which becomes current.
  place(pitch: Pitch, index?: number): void
  stepUp(): void
  stepDown(): void
  next(): void
  finish(): void
  newSession(): void
  // From the results: the same exercise, difficulty and length, the review queue filled with the
  // items of Most mistakes.
  practiceMostMistakes(): void
  // Goes on with a session saved on another page, whatever the preferences say now.
  resume(saved: SavedSession): void
  // Saves the session as it is now, so that the time passed is right when the page is hidden.
  saveProgress(): void
}

// What the session needs of a trainer of either exercise.
interface QuestionTrainer {
  readonly state: Pick<TrainerState, 'question' | 'firstGrade' | 'outcome'>
  readonly secondGrade: Grade | null
  selectDuration(duration: Duration): void
  toggleSharp(): void
  toggleFlat(): void
  toggleDot(): void
  previousNote(): void
  nextNote(): void
  goToNote(index: number): void
  check(): void
  next(): void
}

// What a session is started with, kept so that its results can start it again.
interface Setup {
  readonly length: SessionLength
  readonly difficulty: Difficulty
  readonly exercise: Exercise
}

interface Run<T extends QuestionTrainer> {
  readonly setup: Setup
  readonly trainer: T
  readonly reviews: ReviewQueueService
  readonly attempts: 1 | 2
  readonly durations: readonly Duration['value'][]
  readonly dots: boolean
  // Whether the difficulty asks for signs: the sharp and the flat, in writing the natural too.
  readonly signs: boolean
  readonly startedAt: number
  // Whether the questions go by rows: Read notes with questions of one note.
  readonly inRows: boolean
  number: number
  // The notes passed in the row of the current question.
  passed: readonly PassedNote[]
  score: Score
  // Of the first attempts, as the score.
  mistakes: Mistakes
  previousOutcome: Outcome | null
  // Null until the staff has drawn the current note: loading time is not answer time.
  shownAt: number | null
  // Given the state as checked: a second attempt clears the wrong choices.
  mistakesIn(state: T['state']): Mistake[]
}

type Reading = Run<Trainer> & {
  readonly noteInput: NoteInput
  readonly keys: readonly PianoKey[]
}

type Writing = Run<WritingTrainer>

type Phase =
  | { readonly kind: 'choosing' }
  | { readonly kind: 'question'; readonly run: Reading }
  | { readonly kind: 'writing'; readonly run: Writing }
  | {
      readonly kind: 'results'
      readonly score: Score
      readonly mistakes: Mistakes
      readonly setup: Setup
    }

// Without an exercise the session reads notes, as it did before writing came; without a note
// input it reads them with the names.
export type SessionModes = Pick<
  Preferences,
  'autoAdvance' | 'showAnswerAtOnce' | 'chooseAutoAdvance' | 'chooseShowAnswerAtOnce' | 'difficulty'
> &
  Partial<Pick<Preferences, 'exercise' | 'noteInput' | 'preset'>>

const answerRows = (difficulty: Difficulty) => ({
  durations: DURATION_VALUES.filter((value) => difficulty.durations.includes(value)),
  dots: difficulty.dots && difficulty.askDuration,
  signs: difficulty.keySignatures > 0 || difficulty.accidentals !== 'none',
})

// The notes of a question wrong in the attempt just checked, each with the topics of its mistake.
const mistakesOf = (
  question: Question,
  topicsOf: (index: number) => readonly WikiTopic[],
): Mistake[] =>
  question.notes.flatMap(({ pitch, duration }, index) => {
    const topics = topicsOf(index)
    return topics.length > 0 ? [{ item: { pitch, duration }, topics }] : []
  })

const readingMistakes =
  (input: NoteInput) =>
  ({ question, notes, askDuration }: TrainerState): Mistake[] =>
    mistakesOf(question, (index) =>
      readingMistakeTopics(
        question,
        index,
        noteAnswerOf(notes[index] as NoteChoice, input, askDuration),
        input,
      ),
    )

const writingMistakes = ({ question, notes, askDuration }: WritingTrainerState): Mistake[] =>
  mistakesOf(question, (index) => {
    const { placed, accidental, selectedDuration } = notes[index] as WrittenChoice
    return writingMistakeTopics(question, index, {
      pitch: placed as Pitch,
      duration: askDuration ? selectedDuration : null,
      ...(accidental && { accidental }),
    })
  })

// Each note of the question with whether it was right in the attempt graded.
const answersOf = (question: Question, grade: Grade): ItemAnswer[] =>
  question.notes.map(({ pitch, duration }, index) => ({
    item: { pitch, duration },
    right: isNoteRight(grade[index] as NoteGrade),
  }))

const passedOf = (question: Question, firstGrade: Grade | null): PassedNote[] =>
  question.notes.map((note, index) => ({
    note,
    right: firstGrade !== null && isNoteRight(firstGrade[index] as NoteGrade),
  }))

export interface ProgressRecorder {
  recordAnswers(answers: readonly ItemAnswer[]): void
  recordSession(summary: SessionSummary): void
  saveSession(saved: SavedSession): void
  discardSession(): void
}

const NO_REVIEWS: ReviewQueueService = { due: [], queue: EMPTY_REVIEW_QUEUE, record: () => {} }

const NO_COUNTER: VisitCounter = { count: () => {} }

const NO_PROGRESS: ProgressRecorder = {
  recordAnswers: () => {},
  recordSession: () => {},
  saveSession: () => {},
  discardSession: () => {},
}

// Where a run starts: at the beginning, or where a saved session stood.
interface Start {
  readonly attempts: 1 | 2
  readonly number: number
  readonly elapsedMs: number
  readonly score: Score
  readonly mistakes: Mistakes
  // The question to open first; null makes a new one.
  readonly question: Question | null
  // The question before the first one made: its key goes on in a row of questions of one note.
  readonly previous?: Question
}

// In Read notes with questions of one note a row of this many questions has one key signature.
export const ROW_LENGTH = 10

const startsRow = (number: number) => (number - 1) % ROW_LENGTH === 0

const rowOf = (number: number) => Math.ceil(number / ROW_LENGTH)

const isLastRow = (length: SessionLength, number: number) =>
  typeof length === 'number' && rowOf(number) === rowOf(length)

const FLAGGED: readonly Duration['value'][] = ['eighth', 'sixteenth']

const rowSlotsOf = ({ keySignatures, accidentals, durations }: Difficulty): RowSlots => ({
  keySignatures,
  signs: keySignatures > 0 || accidentals !== 'none',
  flags: durations.some((value) => FLAGGED.includes(value)),
})

const lowestOf = (difficulty: Difficulty): Pitch =>
  allowedPitches(difficulty)[0] ?? difficulty.range.low

const isRightOutcome = (outcome: Outcome | null): outcome is 'correct' | 'correct-second-try' =>
  outcome === 'correct' || outcome === 'correct-second-try'

// The quick mode lives here, not in the trainer: the trainer only grades one question.
// The review queue is made anew for each session: an item does not outlive its session.
export function createSession(
  questionsFor: (difficulty: Difficulty) => QuestionGenerator,
  clock: Clock,
  modes: SessionModes,
  reviewQueue: (queue: ReviewQueue) => ReviewQueueService = () => NO_REVIEWS,
  progress: ProgressRecorder = NO_PROGRESS,
  counter: VisitCounter = NO_COUNTER,
): Session {
  let phase: Phase = { kind: 'choosing' }

  const current = (): Reading | null => (phase.kind === 'question' ? phase.run : null)
  const writing = (): Writing | null => (phase.kind === 'writing' ? phase.run : null)
  const running = (): Run<QuestionTrainer> | null => current() ?? writing()

  const elapsedMs = (run: Run<QuestionTrainer>) => clock.now() - run.startedAt

  // Read anew each time: the time can run out with nothing done on the page.
  const isLast = (run: Run<QuestionTrainer>) =>
    isLastQuestion(run.setup.length, run.number) || isTimeUp(run.setup.length, elapsedMs(run))

  const check = (run: Run<QuestionTrainer>) => {
    const checked = run.trainer.state
    run.trainer.check()
    const { firstGrade } = run.trainer.state
    if (checked.firstGrade === null && firstGrade) {
      const elapsedMs = run.shownAt === null ? 0 : clock.now() - run.shownAt
      run.score = recordGrade(run.score, firstGrade, elapsedMs)
      run.mistakes = recordMistakes(run.mistakes, run.mistakesIn(checked))
      progress.recordAnswers(answersOf(checked.question, firstGrade))
    }
    save(run)
  }

  // Nothing is saved before the first check, as Finish leaves nothing then.
  const save = (run: Run<QuestionTrainer>) => {
    if (run.score.checked === 0) return
    const { question, firstGrade } = run.trainer.state
    progress.saveSession({
      ...run.setup,
      attempts: run.attempts,
      number: run.number,
      elapsedMs: elapsedMs(run),
      score: run.score,
      mistakes: run.mistakes,
      reviewQueue: run.reviews.queue,
      question,
      grades: firstGrade && { first: firstGrade, second: run.trainer.secondGrade },
    })
  }

  // The only way into the results, so that each session is recorded once.
  const showResults = ({
    score,
    mistakes,
    setup,
  }: Pick<Run<QuestionTrainer>, 'score' | 'mistakes' | 'setup'>) => {
    phase = { kind: 'results', score, mistakes, setup }
    progress.discardSession()
    progress.recordSession({
      exercise: setup.exercise,
      length: setup.length,
      questions: score.checked,
      accuracy: accuracyPercent(score) ?? 0,
    })
    counter.count({
      name: 'summary',
      exercise: setup.exercise,
      score: score.points,
      total: score.maxPoints,
    })
  }

  const answer = (run: Reading) => {
    check(run)
    // A wrong answer stays on the question for the second attempt or the review.
    const result = run.trainer.state.outcome
    if (modes.autoAdvance && isRightOutcome(result)) moveOn(run, result)
  }

  // A press only chooses; the one that completes the answer answers.
  const answerWith = (choose: (trainer: Trainer) => void) => {
    const run = current()
    if (!run || !modes.autoAdvance) return
    choose(run.trainer)
    const { state } = run.trainer
    const { selectedDuration, askDuration, outcome } = state
    if (!hasPitch(state) || (askDuration && selectedDuration === null) || outcome) return
    answer(run)
  }

  const moveOn = (run: Run<QuestionTrainer>, previousOutcome: Outcome | null) => {
    if (isLast(run)) {
      showResults(run)
      return
    }
    // Recorded before the next question is made, so that an item due on it is asked about.
    const { question, firstGrade } = run.trainer.state
    if (firstGrade) run.reviews.record(question, firstGrade, run.trainer.secondGrade)
    run.trainer.next()
    run.number += 1
    run.passed = startsRow(run.number) ? [] : [...run.passed, ...passedOf(question, firstGrade)]
    run.shownAt = null
    run.previousOutcome = previousOutcome
    save(run)
  }

  // The note input is the one of the preferences now, even for a session saved with another.
  const readingRun = (
    run: Omit<Reading, 'trainer' | 'mistakesIn' | 'noteInput' | 'keys'>,
    nextQuestion: () => Question,
    options: { attempts: 1 | 2; askDuration: boolean },
  ): Reading => {
    const noteInput = modes.noteInput ?? 'names'
    return {
      ...run,
      noteInput,
      keys: keyboardKeys(run.setup.difficulty),
      trainer: createTrainer(nextQuestion, { ...options, input: noteInput }),
      mistakesIn: readingMistakes(noteInput),
    }
  }

  const begin = (setup: Setup, reviews: ReviewQueueService, from: Start): Run<QuestionTrainer> => {
    const { difficulty } = setup
    const generate = questionsFor(difficulty)
    let first = from.question
    let previous = from.previous ?? from.question
    let made = from.number - 1
    const inRows = setup.exercise === 'read' && difficulty.questionLength === 'one-note'
    const nextQuestion = () => {
      made += 1
      const keySignature = inRows && !startsRow(made) ? previous?.keySignature : undefined
      const question = first ?? generate(reviews.due, keySignature && { keySignature })
      first = null
      previous = question
      return question
    }
    const options = { attempts: from.attempts, askDuration: difficulty.askDuration }
    const run = {
      setup,
      reviews,
      attempts: from.attempts,
      ...answerRows(difficulty),
      startedAt: clock.now() - from.elapsedMs,
      inRows,
      number: from.number,
      passed: [],
      score: from.score,
      mistakes: from.mistakes,
      previousOutcome: null,
      shownAt: null,
    }
    phase =
      setup.exercise === 'write'
        ? {
            kind: 'writing',
            run: {
              ...run,
              trainer: createWritingTrainer(nextQuestion, allowedPitches(difficulty), options),
              mistakesIn: writingMistakes,
            },
          }
        : { kind: 'question', run: readingRun(run, nextQuestion, options) }
    return phase.run
  }

  // The preset of the preferences now, even for a session that keeps the difficulty of one before.
  const presetOf = ({ difficulty }: Setup) => {
    const { preset } = modes
    return preset && isSameDifficulty(difficulty, presetDifficulty(preset)) ? preset : 'custom'
  }

  // A session started anew replaces the one saved.
  const beginAnew = (setup: Setup, queue: ReviewQueue) => {
    progress.discardSession()
    counter.count({ name: 'session', exercise: setup.exercise, preset: presetOf(setup) })
    begin(setup, reviewQueue(queue), {
      attempts: modes.showAnswerAtOnce ? 1 : 2,
      number: 1,
      elapsedMs: 0,
      score: EMPTY_SCORE,
      mistakes: NO_MISTAKES,
      question: null,
    })
  }

  return {
    get state(): SessionState {
      switch (phase.kind) {
        case 'choosing':
          return { phase: 'choosing' }
        case 'results':
          return {
            phase: 'results',
            score: phase.score,
            mostMistakes: mostMistakes(phase.mistakes),
          }
        case 'question': {
          const { run } = phase
          const { setup, number, score, trainer, durations, dots, signs, previousOutcome } = run
          return {
            phase: 'question',
            noteInput: run.noteInput,
            keys: run.keys,
            length: setup.length,
            number,
            elapsedMs: elapsedMs(run),
            score,
            isLast: isLast(run),
            // A hint shown before the quick mode was turned on no longer applies.
            trainer: modes.autoAdvance ? { ...trainer.state, hint: false } : trainer.state,
            durations,
            dots,
            sharpsAndFlats: signs,
            previousOutcome,
            row: run.inRows
              ? {
                  passed: run.passed,
                  final: isLastRow(setup.length, number),
                  slots: rowSlotsOf(setup.difficulty),
                  lowest: lowestOf(setup.difficulty),
                }
              : null,
          }
        }
        case 'writing': {
          const { run } = phase
          const { setup, number, score, trainer, durations, dots, signs, previousOutcome } = run
          return {
            phase: 'writing',
            length: setup.length,
            number,
            elapsedMs: elapsedMs(run),
            score,
            isLast: isLast(run),
            writing: trainer.state,
            durations,
            dots,
            signs,
            previousOutcome,
          }
        }
      }
    },

    get autoAdvance() {
      return modes.autoAdvance
    },

    setAutoAdvance(on) {
      const wasOn = modes.autoAdvance
      modes.chooseAutoAdvance(on)
      const run = running()
      if (!run) return
      const { outcome } = run.trainer.state
      // During the second attempt the question stays: it is not over yet.
      if (on && outcome) moveOn(run, outcome)
      // Back in the normal mode a result left from the quick mode would read as belonging to
      // this question.
      if (wasOn && !on) run.previousOutcome = null
      // A written note waits for Check in either mode, so only a reading choice starts over.
      const reading = current()
      if (!reading) return
      // A choice made for Check is not half of a quick answer.
      if (!wasOn && on && !outcome) reading.trainer.clearChoice()
      // Back in the normal mode the choice starts over, a hint left from the quick mode with it.
      if (wasOn && !on) reading.trainer.clearChoice()
    },

    get showAnswerAtOnce() {
      return modes.showAnswerAtOnce
    },

    // Read on start only: a session keeps the attempts it began with, even if changed in Settings.
    setShowAnswerAtOnce(on) {
      modes.chooseShowAnswerAtOnce(on)
    },

    start(length, difficulty = modes.difficulty) {
      beginAnew({ length, difficulty, exercise: modes.exercise ?? 'read' }, reviewQueueOf([]))
    },

    noteDrawn() {
      const run = running()
      if (run && run.shownAt === null) run.shownAt = clock.now()
    },

    select(letter) {
      current()?.trainer.select(letter)
    },

    pressKey(key) {
      current()?.trainer.pressKey(key)
    },

    selectDuration(duration) {
      running()?.trainer.selectDuration(duration)
    },

    toggleDot() {
      running()?.trainer.toggleDot()
    },

    toggleSharp() {
      running()?.trainer.toggleSharp()
    },

    toggleFlat() {
      running()?.trainer.toggleFlat()
    },

    toggleNatural() {
      writing()?.trainer.toggleNatural()
    },

    check() {
      const run = current()
      if (run && !modes.autoAdvance) check(run)
      const written = writing()
      // Writing is checked with Check in the quick mode too: after a touch the note often still
      // needs a step, so the quick mode only drops the pause.
      if (!written) return
      check(written)
      const result = written.trainer.state.outcome
      if (modes.autoAdvance && isRightOutcome(result)) moveOn(written, result)
    },

    answer(letter) {
      answerWith((trainer) => trainer.select(letter))
    },

    answerKey(key) {
      answerWith((trainer) => trainer.pressKey(key))
    },

    playNote(key) {
      const run = current()
      if (!run || run.trainer.state.outcome) return
      run.trainer.pressKey(key)
      if (run.trainer.state.notes.every(hasPitch)) answer(run)
    },

    answerDuration(duration) {
      answerWith((trainer) => trainer.selectDuration(duration))
    },

    previousNote() {
      running()?.trainer.previousNote()
    },

    nextNote() {
      running()?.trainer.nextNote()
    },

    goToNote(index) {
      running()?.trainer.goToNote(index)
    },

    place(pitch, index) {
      writing()?.trainer.place(pitch, index)
    },

    stepUp() {
      writing()?.trainer.stepUp()
    },

    stepDown() {
      writing()?.trainer.stepDown()
    },

    next() {
      const run = running()
      if (run?.trainer.state.outcome) moveOn(run, null)
    },

    finish() {
      const run = running()
      if (!run) return
      if (run.score.checked > 0) showResults(run)
      else phase = { kind: 'choosing' }
    },

    newSession() {
      phase = { kind: 'choosing' }
    },

    practiceMostMistakes() {
      if (phase.kind !== 'results') return
      beginAnew(phase.setup, reviewQueueOf(mostMistakes(phase.mistakes).map(({ item }) => item)))
    },

    // A question checked is left as by Next: the next one opens, or the results if it was the last.
    resume(saved) {
      const { exercise, length, difficulty, grades, question, number } = saved
      const setup: Setup = { exercise, length, difficulty }
      if (!grades) {
        begin(setup, reviewQueue(saved.reviewQueue), saved)
        return
      }
      if (isLastQuestion(length, number) || isTimeUp(length, saved.elapsedMs)) {
        showResults({ ...saved, setup })
        return
      }
      const reviews = reviewQueue(saved.reviewQueue)
      reviews.record(question, grades.first, grades.second)
      save(
        begin(setup, reviews, { ...saved, number: number + 1, question: null, previous: question }),
      )
    },

    saveProgress() {
      const run = running()
      if (run) save(run)
    },
  }
}
