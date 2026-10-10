export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const

export type Letter = (typeof LETTERS)[number]

export type Alteration = -2 | -1 | 1 | 2

export interface Pitch {
  letter: Letter
  octave: number
  // A natural pitch has no alteration field, so that it is written as before.
  alteration?: Alteration
}
