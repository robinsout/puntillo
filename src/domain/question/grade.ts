import type { Letter } from '../pitch'
import type { Duration, Question } from './question'

// A null duration means the duration is not asked, so it is neither answered nor graded.
export interface NoteAnswer {
  letter: Letter
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
      pitch: note.pitch.letter === part.letter,
      duration: part.duration === null ? null : note.duration.value === part.duration.value,
    }
  })
}

export const isNoteRight = (grade: NoteGrade): boolean => grade.pitch && grade.duration !== false

export const isRight = (grade: Grade): boolean => grade.every(isNoteRight)
