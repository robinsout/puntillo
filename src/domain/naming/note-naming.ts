import type { Alteration, Letter } from '../pitch'

export const NOTE_NAMINGS = ['latin-syllable', 'cyrillic-syllable', 'letter'] as const

export type NoteNaming = (typeof NOTE_NAMINGS)[number]

export function isNoteNaming(value: string): value is NoteNaming {
  return (NOTE_NAMINGS as readonly string[]).includes(value)
}

const NAMES: Record<NoteNaming, Record<Letter, string>> = {
  'latin-syllable': { C: 'do', D: 're', E: 'mi', F: 'fa', G: 'sol', A: 'la', B: 'si' },
  'cyrillic-syllable': { C: 'до', D: 'ре', E: 'ми', F: 'фа', G: 'соль', A: 'ля', B: 'си' },
  letter: { C: 'C', D: 'D', E: 'E', F: 'F', G: 'G', A: 'A', B: 'B' },
}

export const SEVENTH_NOTES = ['B', 'H'] as const

export type SeventhNote = (typeof SEVENTH_NOTES)[number]

export function isSeventhNote(value: string): value is SeventhNote {
  return (SEVENTH_NOTES as readonly string[]).includes(value)
}

const SYMBOLS: Record<Alteration, string> = { [-2]: '𝄫', [-1]: '♭', 1: '♯', 2: '𝄪' }

const withSymbol = (name: string, alteration?: Alteration): string =>
  alteration === undefined ? name : `${name}${SYMBOLS[alteration]}`

export function noteName(
  letter: Letter,
  naming: NoteNaming,
  seventhNote: SeventhNote = 'B',
  alteration?: Alteration,
): string {
  if (naming !== 'letter' || letter !== 'B') return withSymbol(NAMES[naming][letter], alteration)
  // In the German usage the H switch stands for, si-flat is B itself.
  if (seventhNote === 'H' && alteration === -1) return 'B'
  return withSymbol(seventhNote, alteration)
}

export interface NoteNameParts {
  readonly name: string
  readonly word?: 'sharp' | 'flat'
}

export function noteNameParts(
  letter: Letter,
  naming: NoteNaming,
  seventhNote: SeventhNote = 'B',
  alteration?: Alteration,
): NoteNameParts {
  if (naming === 'letter' || alteration === undefined)
    return { name: noteName(letter, naming, seventhNote, alteration) }
  return { name: NAMES[naming][letter], word: alteration > 0 ? 'sharp' : 'flat' }
}
