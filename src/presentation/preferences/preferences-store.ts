import { inject, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { Preferences } from '@/application/preferences'
import { canChange, type DifficultyChange, type Preset } from '@/domain/difficulty'
import type { Locale } from '@/domain/language'
import type { NoteNaming, SeventhNote } from '@/domain/naming'
import { preferencesKey } from '@/presentation/dependencies'

function injectPreferences(): Preferences {
  const preferences = inject(preferencesKey)
  if (!preferences)
    throw new Error('Preferences are not provided: provide them with preferencesKey')
  return preferences
}

// The language lives in the i18n locale; the store makes the rest of the preferences reactive.
export const usePreferencesStore = defineStore('preferences', () => {
  const preferences = injectPreferences()
  const noteNaming = ref(preferences.noteNaming)
  const seventhNote = ref(preferences.seventhNote)
  const preset = ref(preferences.preset)
  const difficulty = shallowRef(preferences.difficulty)
  const modified = ref(preferences.modified)
  const canSave = ref(preferences.canSave)

  // The session saves its boxes through the same preferences, so it calls this too.
  function refreshCanSave() {
    canSave.value = preferences.canSave
  }

  function chooseLanguage(language: Locale) {
    preferences.chooseLanguage(language)
    refreshCanSave()
  }

  function chooseNoteNaming(naming: NoteNaming) {
    preferences.chooseNoteNaming(naming)
    noteNaming.value = preferences.noteNaming
    refreshCanSave()
  }

  function chooseSeventhNote(note: SeventhNote) {
    preferences.chooseSeventhNote(note)
    seventhNote.value = preferences.seventhNote
    refreshCanSave()
  }

  function refreshDifficulty() {
    preset.value = preferences.preset
    difficulty.value = preferences.difficulty
    modified.value = preferences.modified
    refreshCanSave()
  }

  function choosePreset(chosen: Preset) {
    preferences.choosePreset(chosen)
    refreshDifficulty()
  }

  function customize(change: DifficultyChange) {
    preferences.customize(change)
    refreshDifficulty()
  }

  const canCustomize = (change: DifficultyChange) => canChange(difficulty.value, change)

  return {
    noteNaming,
    seventhNote,
    preset,
    difficulty,
    modified,
    canSave,
    chooseLanguage,
    chooseNoteNaming,
    chooseSeventhNote,
    choosePreset,
    customize,
    canCustomize,
    refreshCanSave,
  }
})
