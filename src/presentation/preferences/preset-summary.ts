import { presetDifficulty, type Preset } from '@/domain/difficulty'
import type { Locale } from '@/domain/language'
import { noteName, type NoteNaming, type SeventhNote } from '@/domain/naming'
import type { Pitch } from '@/domain/pitch'
import { QUESTION_LENGTH_KEYS } from './question-length-name'

export interface SummaryNaming {
  readonly noteNaming: NoteNaming
  readonly seventhNote: SeventhNote
}

export interface SummaryI18n {
  readonly locale: Locale
  readonly t: (key: string) => string
}

// The line on the card of a preset: "C4–C5 · one note".
export function presetSummary(preset: Preset, naming: SummaryNaming, i18n: SummaryI18n): string {
  const { range, questionLength } = presetDifficulty(preset)
  const name = ({ letter, octave }: Pitch) =>
    `${noteName(letter, naming.noteNaming, naming.seventhNote)}${octave}`
  const length = i18n.t(QUESTION_LENGTH_KEYS[questionLength])
  const lowered = length.charAt(0).toLocaleLowerCase(i18n.locale) + length.slice(1)
  return `${name(range.low)}–${name(range.high)} · ${lowered}`
}
