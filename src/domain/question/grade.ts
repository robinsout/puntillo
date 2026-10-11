import { isSamePitch, type Alteration, type Letter, type Pitch } from '../pitch'
import { isSameDuration, type Duration, type Question } from './question'

// A null duration means the duration is not asked, so it is neither answered nor graded.
export interface NoteAnswer {
  letter: Letter
  alteration?: Alteration
  duration: Duration | null
}

export type Answer = readonly NoteAnswer[]

export interface NoteGrade {
  pitch: boolean
  duration: boolean | null
}

export type Grade = readonly NoteGrade[]

export function gradeAnswer(question: Question, answer: Answer): Grade {
  if (answer.length !== question.notes.length)
    throw new Error(
      `An answer of ${answer.length} parts given to a question of ${question.notes.length} notes`,
    )
  return question.notes.map((note, index) => {
    const part = answer[index] as NoteAnswer
    return {
      pitch: note.pitch.letter === part.letter && note.pitch.alteration === part.alteration,
      duration: part.duration === null ? null : isSameDuration(note.duration, part.duration),
    }
  })
}

// A written note stands on a step, so its octave counts, unlike a name. A null duration means the
// duration is not asked, as in an answer.
export interface WrittenNote {
  pitch: Pitch
  duration: Duration | null
}

export function gradeWriting(question: Question, written: readonly WrittenNote[]): Grade {
  if (written.length !== question.notes.length)
    throw new Error(
      `${written.length} written notes given to a question of ${question.notes.length} notes`,
    )
  return question.notes.map((note, index) => {
    const { pitch, duration } = written[index] as WrittenNote
    return {
      pitch: isSamePitch(note.pitch, pitch),
      duration: duration === null ? null : isSameDuration(note.duration, duration),
    }
  })
}

export const isNoteRight = (grade: NoteGrade): boolean => grade.pitch && grade.duration !== false

export const isRight = (grade: Grade): boolean => grade.every(isNoteRight)
