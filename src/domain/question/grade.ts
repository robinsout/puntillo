import type { Alteration, Letter } from '../pitch'
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

export const isNoteRight = (grade: NoteGrade): boolean => grade.pitch && grade.duration !== false

export const isRight = (grade: Grade): boolean => grade.every(isNoteRight)
