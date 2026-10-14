import { inject, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { Preferences } from '@/application/preferences'
import { canChange, type DifficultyChange, type Preset } from '@/domain/difficulty'
import type { Locale } from '@/domain/language'
import type { NoteNaming, SeventhNote } from '@/domain/naming'
import type { Exercise } from '@/domain/session'
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
  const exercise = ref(preferences.exercise)
  const showNoteNames = ref(preferences.showNoteNames)

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

  function chooseExercise(chosen: Exercise) {
    preferences.chooseExercise(chosen)
    exercise.value = preferences.exercise
    refreshCanSave()
  }

  function chooseShowNoteNames(on: boolean) {
    preferences.chooseShowNoteNames(on)
    showNoteNames.value = preferences.showNoteNames
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

  // After the preferences were all replaced at once, as by an imported file.
  function refresh() {
    noteNaming.value = preferences.noteNaming
    seventhNote.value = preferences.seventhNote
    exercise.value = preferences.exercise
    showNoteNames.value = preferences.showNoteNames
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
    exercise,
    showNoteNames,
    chooseLanguage,
    chooseNoteNaming,
    chooseSeventhNote,
    chooseExercise,
    chooseShowNoteNames,
    choosePreset,
    customize,
    canCustomize,
    refreshCanSave,
    refresh,
  }
})
