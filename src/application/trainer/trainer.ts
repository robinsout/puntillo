import type { PianoKey } from '@/domain/keyboard'
import type { Letter } from '@/domain/pitch'
import type { Answer, Duration, Grade, NoteAnswer, NoteGrade, Question } from '@/domain/question'
import type { NoteInput } from '@/domain/session'
import { gradeAnswer, isNoteRight, isRight, isSameDuration } from '@/domain/question'

export type ChosenAlteration = -1 | 1

export type Outcome = 'correct' | 'correct-second-try' | 'incorrect'

export interface NoteChoice {
  readonly selected: Letter | null
  readonly selectedDuration: Duration | null
  readonly wrongChoice: Letter | null
  readonly alteration: ChosenAlteration | null
  readonly wrongAlteration: ChosenAlteration | null
  readonly wrongDuration: Duration | null
  readonly dot: boolean
  readonly key: PianoKey | null
  readonly wrongKey: PianoKey | null
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
  // Null until the second attempt is graded.
  readonly secondGrade: Grade | null
  select(letter: Letter): void
  pressKey(key: PianoKey): void
  selectDuration(duration: Duration): void
  toggleDot(): void
  toggleSharp(): void
  toggleFlat(): void
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
  readonly input: NoteInput
}

const NO_CHOICE: NoteChoice = {
  selected: null,
  selectedDuration: null,
  wrongChoice: null,
  alteration: null,
  wrongAlteration: null,
  wrongDuration: null,
  dot: false,
  key: null,
  wrongKey: null,
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

// Either exercise: the notes of a question to read or to write.
type NotesInTurn = Pick<TrainerState, 'firstGrade' | 'current'> & {
  readonly notes: readonly unknown[]
}

export const hasOpenNoteBefore = (state: NotesInTurn): boolean =>
  state.notes.some((_, index) => index < state.current && isNoteOpen(state, index))

export const hasOpenNoteAfter = (state: NotesInTurn): boolean =>
  state.notes.some((_, index) => index > state.current && isNoteOpen(state, index))

// Only the part of the input in use is ever chosen, so the other one stays null.
export const hasPitch = (choice: NoteChoice): boolean =>
  choice.selected !== null || choice.key !== null

export function noteAnswerOf(
  choice: NoteChoice,
  input: NoteInput,
  askDuration: boolean,
): NoteAnswer {
  const duration = askDuration ? choice.selectedDuration : null
  return input !== 'names'
    ? { key: choice.key as PianoKey, duration }
    : { letter: choice.selected as Letter, alteration: choice.alteration ?? undefined, duration }
}

const withoutPitch = (choice: NoteChoice): NoteChoice => ({
  ...choice,
  selected: null,
  alteration: null,
  key: null,
})

const withoutDuration = (choice: NoteChoice): NoteChoice => ({
  ...choice,
  selectedDuration: null,
  dot: false,
})

function markWrong(choice: NoteChoice, grade: NoteGrade): NoteChoice {
  return {
    ...choice,
    wrongChoice: grade.pitch ? null : choice.selected,
    wrongAlteration: grade.pitch ? null : choice.alteration,
    wrongKey: grade.pitch ? null : choice.key,
    wrongDuration: grade.duration === false ? choice.selectedDuration : null,
  }
}

// Clears the parts of a choice that are not settled.
function clearOpen(choice: NoteChoice, pitchKept: boolean, durationKept: boolean): NoteChoice {
  const pitchCleared = pitchKept ? choice : withoutPitch(choice)
  return durationKept ? pitchCleared : withoutDuration(pitchCleared)
}

const clearWrong = (choice: NoteChoice, grade: NoteGrade): NoteChoice =>
  clearOpen(choice, grade.pitch, grade.duration !== false)

export function createTrainer(
  nextQuestion: () => Question,
  options: Partial<TrainerOptions> = {},
): Trainer {
  const { attempts, input, ...asked }: TrainerOptions = {
    attempts: 2,
    askDuration: true,
    input: 'names',
    ...options,
  }
  // An instrument is heard for its pitch only, and a note played is an answer even if rejected
  // before: the player cannot take back what was played.
  const heard = input === 'microphone'
  const askDuration = asked.askDuration && !heard

  const stateOf = (progress: Progress): TrainerState => ({
    ...progress,
    ...(progress.notes[progress.current] ?? NO_CHOICE),
    askDuration,
  })

  let state = stateOf(opened(nextQuestion()))
  let secondGrade: Grade | null = null
  const update = (change: Partial<Progress>) => {
    state = stateOf({ ...state, ...change })
  }

  const isOver = (): boolean => state.outcome !== null
  const isAnswered = (choice: NoteChoice): boolean =>
    hasPitch(choice) && (!askDuration || choice.selectedDuration !== null)

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

  const toggle = (sign: ChosenAlteration) => {
    if (isOver() || pitchSettled(state, state.current)) return
    const alteration = state.alteration === sign ? null : sign
    const rejected = state.selected === state.wrongChoice && alteration === state.wrongAlteration
    choose({ alteration, selected: rejected ? null : state.selected })
  }

  const moveTo = (candidates: readonly number[]) => {
    const target = candidates.find((index) => isNoteOpen(state, index))
    if (target !== undefined) update({ current: target })
  }
  const indexes = (): number[] => state.notes.map((_, index) => index)

  const answerOf = (): Answer =>
    state.notes.map((choice) => noteAnswerOf(choice, input, askDuration))

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

    get secondGrade() {
      return secondGrade
    },

    select(letter) {
      if (isOver() || pitchSettled(state, state.current)) return
      if (letter === state.wrongChoice && state.alteration === state.wrongAlteration) return
      choose({ selected: letter })
    },

    pressKey(key) {
      if (isOver() || pitchSettled(state, state.current)) return
      if (!heard && key.number === state.wrongKey?.number) return
      choose({ key })
    },

    selectDuration({ value }) {
      if (!askDuration || isOver() || durationSettled(state, state.current)) return
      const duration: Duration = state.dot ? { value, dots: 1 } : { value }
      if (state.wrongDuration && isSameDuration(duration, state.wrongDuration)) return
      choose({ selectedDuration: duration })
    },

    toggleDot() {
      if (!askDuration || isOver() || durationSettled(state, state.current)) return
      const dot = !state.dot
      const chosen = state.selectedDuration
      const redotted: Duration | null =
        chosen && (dot ? { value: chosen.value, dots: 1 } : { value: chosen.value })
      const rejected =
        redotted && state.wrongDuration && isSameDuration(redotted, state.wrongDuration)
      choose({ dot, selectedDuration: rejected ? null : redotted })
    },

    toggleSharp() {
      toggle(1)
    },

    toggleFlat() {
      toggle(-1)
    },

    check() {
      if (isOver()) return
      if (!state.notes.every(isAnswered)) {
        update({ hint: true })
        return
      }
      const grade = gradeAnswer(state.question, answerOf())
      if (state.firstGrade === null) {
        checkFirst(grade)
        return
      }
      secondGrade = grade
      update({ outcome: isRight(grade) ? 'correct-second-try' : 'incorrect' })
    },

    clearChoice() {
      if (isOver()) return
      update({
        notes: state.notes.map((choice, i) =>
          clearOpen(choice, pitchSettled(state, i), durationSettled(state, i)),
        ),
        current: Math.max(
          0,
          state.notes.findIndex((_, i) => isNoteOpen(state, i)),
        ),
        hint: false,
      })
    },

    // Allowed once the first attempt is graded: the session decides whether
    // leaving during the second attempt is fine (the quick mode) or not.
    next() {
      if (state.firstGrade === null) return
      secondGrade = null
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
