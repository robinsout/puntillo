import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { isWhiteKey, keySpellings, type PianoKey } from '@/domain/keyboard'
import { noteName, noteNameParts } from '@/domain/naming'
import type { Alteration, Letter, Pitch } from '@/domain/pitch'
import { usePreferencesStore } from '@/presentation/preferences'

// The names of the notes and the piano keys in the naming chosen.
export function useNoteNames() {
  const { t } = useI18n()
  const preferences = usePreferencesStore()

  const nameOf = (letter: Letter, alteration?: Alteration) =>
    noteName(letter, preferences.noteNaming, preferences.seventhNote, alteration)

  // A syllable takes its sign in words for a screen reader, "do sharp"; a letter keeps the symbol.
  function inWords(letter: Letter, alteration?: Alteration): string {
    const { name, word } = noteNameParts(
      letter,
      preferences.noteNaming,
      preferences.seventhNote,
      alteration,
    )
    return word ? t(word === 'sharp' ? 'trainer.sharpName' : 'trainer.flatName', { name }) : name
  }

  // "fa♯4"
  const written = ({ letter, alteration, octave }: Pitch) =>
    `${nameOf(letter, alteration)}${octave}`

  // "do sharp 4", a letter joined to its octave: "C♯4".
  const spoken = ({ letter, alteration, octave }: Pitch) =>
    noteNameParts(letter, preferences.noteNaming, preferences.seventhNote, alteration).word
      ? `${inWords(letter, alteration)} ${octave}`
      : `${nameOf(letter, alteration)}${octave}`

  // A black key goes by both of its names: "do♯4/re♭4".
  const keyCaption = (key: PianoKey) => keySpellings(key).map(written).join('/')

  function keyName(key: PianoKey): string {
    const [sharp, flat] = keySpellings(key).map(spoken)
    return flat ? t('trainer.keyName', { sharp, flat }) : (sharp ?? '')
  }

  // Only the keys C carry their octave; the black keys have no label.
  function keyLabel(key: PianoKey): string {
    if (!isWhiteKey(key)) return ''
    const [pitch] = keySpellings(key) as [Pitch]
    return pitch.letter === 'C' ? written(pitch) : nameOf(pitch.letter)
  }

  // Screen readers pronounce the Cyrillic names in Russian whatever the interface language.
  const lang = computed(() => (preferences.noteNaming === 'cyrillic-syllable' ? 'ru' : undefined))

  return { nameOf, inWords, written, keyCaption, keyName, keyLabel, lang }
}

export type NoteNames = ReturnType<typeof useNoteNames>
