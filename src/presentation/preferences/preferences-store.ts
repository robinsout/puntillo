import { inject, ref } from 'vue'
import { defineStore } from 'pinia'
import type { Preferences } from '@/application/preferences'
import type { Preset } from '@/domain/difficulty'
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

  function choosePreset(chosen: Preset) {
    preferences.choosePreset(chosen)
    preset.value = preferences.preset
    refreshCanSave()
  }

  return {
    noteNaming,
    seventhNote,
    preset,
    canSave,
    chooseLanguage,
    chooseNoteNaming,
    chooseSeventhNote,
    choosePreset,
    refreshCanSave,
  }
})
