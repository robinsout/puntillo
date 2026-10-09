import type { Letter } from '../pitch'

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

export function noteName(
  letter: Letter,
  naming: NoteNaming,
  seventhNote: SeventhNote = 'B',
): string {
  if (naming === 'letter' && letter === 'B') return seventhNote
  return NAMES[naming][letter]
}
