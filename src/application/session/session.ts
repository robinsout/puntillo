import { allowedPitches, type Difficulty } from '@/domain/difficulty'
import type { Letter, Pitch } from '@/domain/pitch'
import { DURATION_VALUES } from '@/domain/question'
import type { Duration, Question } from '@/domain/question'
import { EMPTY_SCORE, isLastQuestion, recordGrade } from '@/domain/session'
import type { Score, SessionLength } from '@/domain/session'
import type { Clock } from '@/application/ports'
import type { Preferences } from '@/application/preferences'
import { createTrainer, createWritingTrainer } from '@/application/trainer'
import type {
  Outcome,
  Trainer,
  TrainerState,
  WritingTrainer,
  WritingTrainerState,
} from '@/application/trainer'

export type SessionState =
  | { readonly phase: 'choosing' }
  | {
      readonly phase: 'question'
      readonly length: SessionLength
      readonly number: number
      readonly score: Score
      readonly isLast: boolean
      readonly trainer: TrainerState
      readonly durations: readonly Duration['value'][]
      readonly dots: boolean
      readonly sharpsAndFlats: boolean
      // In the quick mode the result of an answer is shown on the question after it.
      readonly previousOutcome: Outcome | null
    }
  | {
      readonly phase: 'writing'
      readonly length: SessionLength
      readonly number: number
      readonly score: Score
      readonly isLast: boolean
      readonly writing: WritingTrainerState
      readonly durations: readonly Duration['value'][]
      readonly dots: boolean
      // In the quick mode the result of an answer is shown on the question after it.
      readonly previousOutcome: Outcome | null
    }
  | { readonly phase: 'results'; readonly score: Score }

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
  selectDuration(duration: Duration): void
  toggleDot(): void
  toggleSharp(): void
  toggleFlat(): void
  check(): void
  answer(letter: Letter): void
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
}

// What the session needs of a trainer of either exercise.
interface QuestionTrainer {
  readonly state: Pick<TrainerState, 'firstGrade' | 'outcome'>
  selectDuration(duration: Duration): void
  toggleDot(): void
  previousNote(): void
  nextNote(): void
  goToNote(index: number): void
  check(): void
  next(): void
}

interface Run<T extends QuestionTrainer> {
  readonly length: SessionLength
  readonly trainer: T
  readonly durations: readonly Duration['value'][]
  readonly dots: boolean
  number: number
  score: Score
  previousOutcome: Outcome | null
  // Null until the staff has drawn the current note: loading time is not answer time.
  shownAt: number | null
}

interface Reading extends Run<Trainer> {
  readonly sharpsAndFlats: boolean
}

type Writing = Run<WritingTrainer>

type Phase =
  | { readonly kind: 'choosing' }
  | { readonly kind: 'question'; readonly run: Reading }
  | { readonly kind: 'writing'; readonly run: Writing }
  | { readonly kind: 'results'; readonly score: Score }

// Without an exercise the session reads notes, as it did before writing came.
export type SessionModes = Pick<
  Preferences,
  'autoAdvance' | 'showAnswerAtOnce' | 'chooseAutoAdvance' | 'chooseShowAnswerAtOnce' | 'difficulty'
> &
  Partial<Pick<Preferences, 'exercise'>>

// Feature m2-write-notes, slice 2: until signs can be written, a question to write has none.
const writable = (difficulty: Difficulty): Difficulty => ({
  ...difficulty,
  keySignatures: 0,
  accidentals: 'none',
})

const durationsOf = (difficulty: Difficulty) => ({
  durations: DURATION_VALUES.filter((value) => difficulty.durations.includes(value)),
  dots: difficulty.dots && difficulty.askDuration,
})

const isRightOutcome = (outcome: Outcome | null): outcome is 'correct' | 'correct-second-try' =>
  outcome === 'correct' || outcome === 'correct-second-try'

// The quick mode lives here, not in the trainer: the trainer only grades one question.
export function createSession(
  questionsFor: (difficulty: Difficulty) => () => Question,
  clock: Clock,
  modes: SessionModes,
): Session {
  let phase: Phase = { kind: 'choosing' }

  const current = (): Reading | null => (phase.kind === 'question' ? phase.run : null)
  const writing = (): Writing | null => (phase.kind === 'writing' ? phase.run : null)
  const running = (): Run<QuestionTrainer> | null => current() ?? writing()

  const check = (run: Run<QuestionTrainer>) => {
    const wasGraded = run.trainer.state.firstGrade !== null
    run.trainer.check()
    const { firstGrade } = run.trainer.state
    if (!wasGraded && firstGrade) {
      const elapsedMs = run.shownAt === null ? 0 : clock.now() - run.shownAt
      run.score = recordGrade(run.score, firstGrade, elapsedMs)
    }
  }

  // A press only chooses; the one that completes the answer answers.
  const answerWith = (choose: (trainer: Trainer) => void) => {
    const run = current()
    if (!run || !modes.autoAdvance) return
    choose(run.trainer)
    const { selected, selectedDuration, askDuration, outcome } = run.trainer.state
    if (selected === null || (askDuration && selectedDuration === null) || outcome) return
    check(run)
    // A wrong answer stays on the question for the second attempt or the review.
    const result = run.trainer.state.outcome
    if (isRightOutcome(result)) moveOn(run, result)
  }

  const moveOn = (run: Run<QuestionTrainer>, previousOutcome: Outcome | null) => {
    if (isLastQuestion(run.length, run.number)) {
      phase = { kind: 'results', score: run.score }
      return
    }
    run.trainer.next()
    run.number += 1
    run.shownAt = null
    run.previousOutcome = previousOutcome
  }

  return {
    get state(): SessionState {
      switch (phase.kind) {
        case 'choosing':
          return { phase: 'choosing' }
        case 'results':
          return { phase: 'results', score: phase.score }
        case 'question': {
          const {
            length,
            number,
            score,
            trainer,
            durations,
            dots,
            sharpsAndFlats,
            previousOutcome,
          } = phase.run
          return {
            phase: 'question',
            length,
            number,
            score,
            isLast: isLastQuestion(length, number),
            // A hint shown before the quick mode was turned on no longer applies.
            trainer: modes.autoAdvance ? { ...trainer.state, hint: false } : trainer.state,
            durations,
            dots,
            sharpsAndFlats,
            previousOutcome,
          }
        }
        case 'writing': {
          const { length, number, score, trainer, durations, dots, previousOutcome } = phase.run
          return {
            phase: 'writing',
            length,
            number,
            score,
            isLast: isLastQuestion(length, number),
            writing: trainer.state,
            durations,
            dots,
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

    // Read on start only: the box is on the length choice, so a session never sees it change.
    setShowAnswerAtOnce(on) {
      modes.chooseShowAnswerAtOnce(on)
    },

    start(length, difficulty = modes.difficulty) {
      const attempts = modes.showAnswerAtOnce ? 1 : 2
      if (modes.exercise === 'write') {
        const narrowed = writable(difficulty)
        phase = {
          kind: 'writing',
          run: {
            length,
            trainer: createWritingTrainer(questionsFor(narrowed), allowedPitches(narrowed), {
              attempts,
              askDuration: narrowed.askDuration,
            }),
            ...durationsOf(narrowed),
            number: 1,
            score: EMPTY_SCORE,
            previousOutcome: null,
            shownAt: null,
          },
        }
        return
      }
      phase = {
        kind: 'question',
        run: {
          length,
          trainer: createTrainer(questionsFor(difficulty), {
            attempts,
            askDuration: difficulty.askDuration,
          }),
          ...durationsOf(difficulty),
          sharpsAndFlats: difficulty.keySignatures > 0 || difficulty.accidentals !== 'none',
          number: 1,
          score: EMPTY_SCORE,
          previousOutcome: null,
          shownAt: null,
        },
      }
    },

    noteDrawn() {
      const run = running()
      if (run && run.shownAt === null) run.shownAt = clock.now()
    },

    select(letter) {
      current()?.trainer.select(letter)
    },

    selectDuration(duration) {
      running()?.trainer.selectDuration(duration)
    },

    toggleDot() {
      running()?.trainer.toggleDot()
    },

    toggleSharp() {
      current()?.trainer.toggleSharp()
    },

    toggleFlat() {
      current()?.trainer.toggleFlat()
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
      phase = run.score.checked > 0 ? { kind: 'results', score: run.score } : { kind: 'choosing' }
    },

    newSession() {
      phase = { kind: 'choosing' }
    },
  }
}
