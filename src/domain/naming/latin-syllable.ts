import { LETTERS } from '../pitch'
import type { Letter } from '../pitch'

export type LatinSyllableName = 'do' | 're' | 'mi' | 'fa' | 'sol' | 'la' | 'si'

const NAME_BY_LETTER: Record<Letter, LatinSyllableName> = {
  C: 'do',
  D: 're',
  E: 'mi',
  F: 'fa',
  G: 'sol',
  A: 'la',
  B: 'si',
}

export function latinSyllableName(letter: Letter): LatinSyllableName {
  return NAME_BY_LETTER[letter]
}

export const LATIN_SYLLABLE_NAMES: readonly LatinSyllableName[] = LETTERS.map(latinSyllableName)
