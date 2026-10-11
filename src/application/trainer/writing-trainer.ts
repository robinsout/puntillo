import { isSamePitch, type Pitch } from '@/domain/pitch'
import {
  gradeWriting,
  isNoteRight,
  isRight,
  isSameDuration,
  type Duration,
  type Grade,
  type NoteGrade,
  type Question,
} from '@/domain/question'
import { canStepDown, canStepUp, nearestStep, stepDown, stepUp } from '@/domain/staff'
import { isNoteOpen, type Outcome } from './trainer'

// What Check finds missing, in this order: a note not written, a duration not chosen, a note still
// on the step rejected on the first attempt.
export type WritingHint = 'place-note' | 'choose-duration' | 'move-note'

export interface WrittenChoice {
  readonly placed: Pitch | null
  readonly selectedDuration: Duration | null
  readonly dot: boolean
  // The parts rejected on the first attempt, marked while the second one goes on.
  readonly wrongPitch: Pitch | null
  readonly wrongDuration: Duration | null
}

// The top-level choice fields mirror the current note.
export interface WritingTrainerState extends WrittenChoice {
  readonly question: Question
  readonly current: number
  readonly notes: readonly WrittenChoice[]
  // Only the first attempt counts towards the score; the second one is for learning.
  readonly firstGrade: Grade | null
  readonly outcome: Outcome | null
  readonly hint: WritingHint | null
  readonly askDuration: boolean
  readonly canStepUp: boolean
  readonly canStepDown: boolean
}

export interface WritingTrainer {
  readonly state: WritingTrainerState
  // With an index, that note becomes current first: a touch in its column.
  place(pitch: Pitch, index?: number): void
  stepUp(): void
  stepDown(): void
  selectDuration(duration: Duration): void
  toggleDot(): void
  previousNote(): void
  nextNote(): void
  goToNote(index: number): void
  check(): void
  next(): void
}

export interface WritingTrainerOptions {
  // One attempt shows the right answer at once instead of offering a second one.
  readonly attempts: 1 | 2
  readonly askDuration: boolean
}

const NOTHING_WRITTEN: WrittenChoice = {
  placed: null,
  selectedDuration: null,
  dot: false,
  wrongPitch: null,
  wrongDuration: null,
}

type Progress = Pick<
  WritingTrainerState,
  'question' | 'current' | 'notes' | 'firstGrade' | 'outcome' | 'hint'
>

const opened = (question: Question): Progress => ({
  question,
  current: 0,
  notes: question.notes.map(() => NOTHING_WRITTEN),
  firstGrade: null,
  outcome: null,
  hint: null,
})

const dotted = (value: Duration['value'], dot: boolean): Duration =>
  dot ? { value, dots: 1 } : { value }

const isOnRejectedStep = ({ placed, wrongPitch }: WrittenChoice): boolean =>
  placed !== null && wrongPitch !== null && isSamePitch(placed, wrongPitch)

function markWrong(choice: WrittenChoice, grade: NoteGrade): WrittenChoice {
  return {
    ...choice,
    wrongPitch: grade.pitch ? null : choice.placed,
    wrongDuration: grade.duration === false ? choice.selectedDuration : null,
  }
}

// Unlike a name in M1, a wrong note stays where it is, to be moved from there.
const clearWrongDuration = (choice: WrittenChoice, grade: NoteGrade): WrittenChoice =>
  grade.duration === false ? { ...choice, selectedDuration: null, dot: false } : choice

// The steps are the pitches a note may be written on, in ascending order. Unlike M1, writing a
// note never moves on to the next one: after a touch the note often still needs a step.
export function createWritingTrainer(
  nextQuestion: () => Question,
  steps: readonly Pitch[],
  options: Partial<WritingTrainerOptions> = {},
): WritingTrainer {
  const { attempts, askDuration }: WritingTrainerOptions = {
    attempts: 2,
    askDuration: false,
    ...options,
  }

  let progress = opened(nextQuestion())
  const isOver = (): boolean => progress.outcome !== null
  const choiceAt = (index: number): WrittenChoice => progress.notes[index] ?? NOTHING_WRITTEN
  const grade = (index: number): NoteGrade | undefined => progress.firstGrade?.[index]
  // A part right on the first attempt is settled: the second attempt asks only for the wrong one.
  const pitchSettled = (): boolean => isOver() || grade(progress.current)?.pitch === true
  const durationSettled = (): boolean =>
    !askDuration || isOver() || grade(progress.current)?.duration === true

  const write = (part: Partial<WrittenChoice>) => {
    const { current, notes } = progress
    progress = {
      ...progress,
      notes: notes.map((choice, index) => (index === current ? { ...choice, ...part } : choice)),
      hint: null,
    }
  }

  const moveTo = (candidates: readonly number[]) => {
    const target = candidates.find((index) => isNoteOpen(progress, index))
    if (target !== undefined) progress = { ...progress, current: target }
  }
  const indexes = (): number[] => progress.notes.map((_, index) => index)

  const missing = (): WritingHint | null => {
    const { notes } = progress
    if (notes.some((choice) => choice.placed === null)) return 'place-note'
    if (askDuration && notes.some((choice) => choice.selectedDuration === null))
      return 'choose-duration'
    if (notes.some(isOnRejectedStep)) return 'move-note'
    return null
  }

  const checkFirst = (result: Grade) => {
    if (isRight(result)) {
      progress = { ...progress, firstGrade: result, outcome: 'correct' }
      return
    }
    const marked = progress.notes.map((choice, i) => markWrong(choice, result[i] as NoteGrade))
    if (attempts === 1) {
      progress = { ...progress, firstGrade: result, notes: marked, outcome: 'incorrect' }
      return
    }
    progress = {
      ...progress,
      firstGrade: result,
      notes: marked.map((choice, i) => clearWrongDuration(choice, result[i] as NoteGrade)),
      current: result.findIndex((note) => !isNoteRight(note)),
    }
  }

  return {
    get state() {
      const current = choiceAt(progress.current)
      return {
        ...progress,
        ...current,
        askDuration,
        canStepUp: !pitchSettled() && canStepUp(current.placed, steps),
        canStepDown: !pitchSettled() && canStepDown(current.placed, steps),
      }
    },

    place(pitch, index = progress.current) {
      if (isOver() || !isNoteOpen(progress, index) || !progress.notes[index]) return
      progress = { ...progress, current: index }
      if (!pitchSettled()) write({ placed: nearestStep(pitch, steps) })
    },

    stepUp() {
      if (!pitchSettled()) write({ placed: stepUp(choiceAt(progress.current).placed, steps) })
    },

    stepDown() {
      if (!pitchSettled()) write({ placed: stepDown(choiceAt(progress.current).placed, steps) })
    },

    selectDuration({ value }) {
      if (durationSettled()) return
      const { dot, wrongDuration } = choiceAt(progress.current)
      const duration = dotted(value, dot)
      if (wrongDuration && isSameDuration(duration, wrongDuration)) return
      write({ selectedDuration: duration })
    },

    // As in M1: the dot that would make the rejected duration again drops the choice.
    toggleDot() {
      if (durationSettled()) return
      const { dot, selectedDuration, wrongDuration } = choiceAt(progress.current)
      const redotted = selectedDuration && dotted(selectedDuration.value, !dot)
      const rejected = redotted && wrongDuration && isSameDuration(redotted, wrongDuration)
      write({ dot: !dot, selectedDuration: rejected ? null : redotted })
    },

    previousNote() {
      moveTo(
        indexes()
          .filter((index) => index < progress.current)
          .reverse(),
      )
    },

    nextNote() {
      moveTo(indexes().filter((index) => index > progress.current))
    },

    goToNote(index) {
      if (indexes().includes(index)) moveTo([index])
    },

    check() {
      if (isOver()) return
      const hint = missing()
      if (hint) {
        progress = { ...progress, hint }
        return
      }
      const result = gradeWriting(
        progress.question,
        progress.notes.map((choice) => ({
          pitch: choice.placed as Pitch,
          duration: askDuration ? choice.selectedDuration : null,
        })),
      )
      if (progress.firstGrade === null) checkFirst(result)
      else progress = { ...progress, outcome: isRight(result) ? 'correct-second-try' : 'incorrect' }
    },

    next() {
      if (progress.firstGrade !== null) progress = opened(nextQuestion())
    },
  }
}
