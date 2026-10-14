import { describe, expect, it } from 'vitest'
import type { Preset } from '@/domain/difficulty'
import type { Locale } from '@/domain/language'
import type { NoteNaming } from '@/domain/naming'
import { createAppI18n } from '@/infrastructure/i18n'
import { presetSummary } from '@/presentation/preferences/preset-summary'

// Feature navigation-and-settings, slice 4, criterion 13: the line on the card of a preset, its
// range and its question length, "C4–C5 · one note". The notes are named with their octave in the
// naming chosen, as the lists From and To of Customize name them; the length is the name of the
// question length in Customize, lower case where the language wants it. The texts are those of
// the app, so the translation is the one of vue-i18n.

const i18nOf = (locale: Locale) => {
  const { global } = createAppI18n(locale)
  return { locale, t: (key: string) => global.t(key) }
}

const LETTERS = { noteNaming: 'letter', seventhNote: 'B' } as const
const namingOf = (noteNaming: NoteNaming) => ({ noteNaming, seventhNote: 'B' as const })

describe('presetSummary', () => {
  it.each<[Locale, NoteNaming, Preset, string]>([
    ['en', 'letter', 'first-steps', 'C4–C5 · one note'],
    ['en', 'letter', 'confident-reading', 'C4–G5 · one bar'],
    ['en', 'letter', 'advanced', 'A3–C6 · two bars'],
    ['en', 'latin-syllable', 'first-steps', 'do4–do5 · one note'],
    ['en', 'latin-syllable', 'confident-reading', 'do4–sol5 · one bar'],
    ['en', 'latin-syllable', 'advanced', 'la3–do6 · two bars'],
    ['ru', 'cyrillic-syllable', 'first-steps', 'до4–до5 · одна нота'],
    ['ru', 'cyrillic-syllable', 'confident-reading', 'до4–соль5 · один такт'],
    ['ru', 'cyrillic-syllable', 'advanced', 'ля3–до6 · два такта'],
    ['ru', 'letter', 'first-steps', 'C4–C5 · одна нота'],
    ['ru', 'letter', 'confident-reading', 'C4–G5 · один такт'],
    ['ru', 'letter', 'advanced', 'A3–C6 · два такта'],
    ['es', 'latin-syllable', 'first-steps', 'do4–do5 · una nota'],
    ['es', 'latin-syllable', 'confident-reading', 'do4–sol5 · un compás'],
    ['es', 'latin-syllable', 'advanced', 'la3–do6 · dos compases'],
    ['es', 'letter', 'first-steps', 'C4–C5 · una nota'],
    ['es', 'letter', 'confident-reading', 'C4–G5 · un compás'],
    ['es', 'letter', 'advanced', 'A3–C6 · dos compases'],
  ])('says in %s with the naming %s the line of %s: %s', (locale, naming, preset, line) => {
    expect(presetSummary(preset, namingOf(naming), i18nOf(locale))).toBe(line)
  })

  it('names the notes in the naming given, whatever the language', () => {
    expect(presetSummary('first-steps', namingOf('cyrillic-syllable'), i18nOf('en'))).toBe(
      'до4–до5 · one note',
    )
  })

  // The names of the lengths start with a capital in Customize: "One note", "Одна нота".
  it.each<Locale>(['en', 'ru', 'es'])('starts the length with a small letter in %s', (locale) => {
    const length = presetSummary('advanced', LETTERS, i18nOf(locale)).split(' · ')[1] ?? ''

    expect(length).not.toBe('')
    expect(length.charAt(0)).toBe(length.charAt(0).toLocaleLowerCase(locale))
  })
})
