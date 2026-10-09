import type { Letter } from '@/domain/pitch'
import type { Answer, Duration, Grade, NoteGrade, Question } from '@/domain/question'
import { gradeAnswer, isNoteRight, isRight } from '@/domain/question'

export type Outcome = 'correct' | 'correct-second-try' | 'incorrect'

export interface NoteChoice {
  readonly selected: Letter | null
  readonly selectedDuration: Duration | null
  readonly wrongChoice: Letter | null
  readonly wrongDuration: Duration | null
}

// The top-level choice fields mirror the current note.
export interface TrainerState extends NoteChoice {
  readonly question: Question
  readonly current: number
  readonly notes: readonly NoteChoice[]
  // Only the first attempt counts towards the score; the second one is for learning.
  readonly firstGrade: Grade | null
  readonly outcome: Outcome | null
  readonly hint: boolean
  readonly askDuration: boolean
}

export interface Trainer {
  readonly state: TrainerState
  select(letter: Letter): void
  selectDuration(duration: Duration): void
  check(): void
  clearChoice(): void
  next(): void
  previousNote(): void
  nextNote(): void
  goToNote(index: number): void
}

export interface TrainerOptions {
  // One attempt shows the right answer at once instead of offering a second one.
  readonly attempts: 1 | 2
  readonly askDuration: boolean
}

const NO_CHOICE: NoteChoice = {
  selected: null,
  selectedDuration: null,
  wrongChoice: null,
  wrongDuration: null,
}

type Progress = Pick<
  TrainerState,
  'question' | 'current' | 'notes' | 'firstGrade' | 'outcome' | 'hint'
>

const opened = (question: Question): Progress => ({
  question,
  current: 0,
  notes: question.notes.map(() => NO_CHOICE),
  firstGrade: null,
  outcome: null,
  hint: false,
})

const noteGrade = (progress: Progress, index: number): NoteGrade | undefined =>
  progress.firstGrade?.[index]

// A part right on the first attempt is settled: the second attempt asks only for the wrong one.
const pitchSettled = (progress: Progress, index: number): boolean =>
  noteGrade(progress, index)?.pitch === true
const durationSettled = (progress: Progress, index: number): boolean =>
  noteGrade(progress, index)?.duration === true

// In the second attempt only the notes wrong in the first one are open.
export function isNoteOpen(state: Pick<TrainerState, 'firstGrade'>, index: number): boolean {
  const grade = state.firstGrade?.[index]
  return grade === undefined || !isNoteRight(grade)
}

export const isNoteMarked = (state: Pick<TrainerState, 'firstGrade'>, index: number): boolean =>
  state.firstGrade !== null && isNoteOpen(state, index)

export const hasOpenNoteBefore = (state: TrainerState): boolean =>
  state.notes.some((_, index) => index < state.current && isNoteOpen(state, index))

export const hasOpenNoteAfter = (state: TrainerState): boolean =>
  state.notes.some((_, index) => index > state.current && isNoteOpen(state, index))

function markWrong(choice: NoteChoice, grade: NoteGrade): NoteChoice {
  return {
    ...choice,
    wrongChoice: grade.pitch ? null : choice.selected,
    wrongDuration: grade.duration === false ? choice.selectedDuration : null,
  }
}

function clearWrong(choice: NoteChoice, grade: NoteGrade): NoteChoice {
  return {
    ...choice,
    selected: grade.pitch ? choice.selected : null,
    selectedDuration: grade.duration === false ? null : choice.selectedDuration,
  }
}

export function createTrainer(
  nextQuestion: () => Question,
  options: Partial<TrainerOptions> = {},
): Trainer {
  const { attempts, askDuration }: TrainerOptions = { attempts: 2, askDuration: true, ...options }

  const stateOf = (progress: Progress): TrainerState => {
    const { selected, selectedDuration, wrongChoice, wrongDuration } =
      progress.notes[progress.current] ?? NO_CHOICE
    return { ...progress, selected, selectedDuration, wrongChoice, wrongDuration, askDuration }
  }

  let state = stateOf(opened(nextQuestion()))
  const update = (change: Partial<Progress>) => {
    state = stateOf({ ...state, ...change })
  }

  const isOver = (): boolean => state.outcome !== null
  const isAnswered = (choice: NoteChoice): boolean =>
    choice.selected !== null && (!askDuration || choice.selectedDuration !== null)

  const nextUnanswered = (notes: readonly NoteChoice[], from: number): number | undefined => {
    const index = notes.findIndex(
      (choice, i) => i > from && isNoteOpen(state, i) && !isAnswered(choice),
    )
    return index === -1 ? undefined : index
  }

  // The first answer of a note moves on to the next note still to answer on the right.
  const choose = (part: Partial<NoteChoice>) => {
    const { current, notes } = state
    const before = notes[current] ?? NO_CHOICE
    const after = { ...before, ...part }
    const changed = notes.map((choice, i) => (i === current ? after : choice))
    const movesOn = !isAnswered(before) && isAnswered(after)
    update({
      notes: changed,
      hint: false,
      current: movesOn ? (nextUnanswered(changed, current) ?? current) : current,
    })
  }

  const moveTo = (candidates: readonly number[]) => {
    const target = candidates.find((index) => isNoteOpen(state, index))
    if (target !== undefined) update({ current: target })
  }
  const indexes = (): number[] => state.notes.map((_, index) => index)

  const answerOf = (): Answer =>
    state.notes.map((choice) => ({
      letter: choice.selected as Letter,
      duration: askDuration ? choice.selectedDuration : null,
    }))

  const checkFirst = (grade: Grade) => {
    if (isRight(grade)) {
      update({ firstGrade: grade, outcome: 'correct' })
      return
    }
    const marked = state.notes.map((choice, i) => markWrong(choice, grade[i] as NoteGrade))
    if (attempts === 1) {
      update({ firstGrade: grade, notes: marked, outcome: 'incorrect' })
      return
    }
    update({
      firstGrade: grade,
      notes: marked.map((choice, i) => clearWrong(choice, grade[i] as NoteGrade)),
      current: grade.findIndex((note) => !isNoteRight(note)),
    })
  }

  return {
    get state() {
      return state
    },

    select(letter) {
      if (isOver() || pitchSettled(state, state.current) || letter === state.wrongChoice) return
      choose({ selected: letter })
    },

    selectDuration(duration) {
      if (!askDuration || isOver() || durationSettled(state, state.current)) return
      if (duration.value === state.wrongDuration?.value) return
      choose({ selectedDuration: duration })
    },

    check() {
      if (isOver()) return
      if (!state.notes.every(isAnswered)) {
        update({ hint: true })
        return
      }
      const grade = gradeAnswer(state.question, answerOf())
      if (state.firstGrade === null) checkFirst(grade)
      else update({ outcome: isRight(grade) ? 'correct-second-try' : 'incorrect' })
    },

    clearChoice() {
      if (isOver()) return
      update({
        notes: state.notes.map((choice, i) => ({
          ...choice,
          selected: pitchSettled(state, i) ? choice.selected : null,
          selectedDuration: durationSettled(state, i) ? choice.selectedDuration : null,
        })),
        hint: false,
      })
    },

    // Allowed once the first attempt is graded: the session decides whether
    // leaving during the second attempt is fine (the quick mode) or not.
    next() {
      if (state.firstGrade === null) return
      state = stateOf(opened(nextQuestion()))
    },

    previousNote() {
      moveTo(
        indexes()
          .filter((index) => index < state.current)
          .reverse(),
      )
    },

    nextNote() {
      moveTo(indexes().filter((index) => index > state.current))
    },

    goToNote(index) {
      if (indexes().includes(index)) moveTo([index])
    },
  }
}
