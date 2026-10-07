export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const

export type Letter = (typeof LETTERS)[number]

export interface Pitch {
  letter: Letter
  octave: number
}
