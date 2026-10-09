import { inject, ref } from 'vue'
import { defineStore } from 'pinia'
import type { Preferences } from '@/application/preferences'
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

  function chooseNoteNaming(naming: NoteNaming) {
    preferences.chooseNoteNaming(naming)
    noteNaming.value = preferences.noteNaming
  }

  function chooseSeventhNote(note: SeventhNote) {
    preferences.chooseSeventhNote(note)
    seventhNote.value = preferences.seventhNote
  }

  return { noteNaming, seventhNote, chooseNoteNaming, chooseSeventhNote }
})
