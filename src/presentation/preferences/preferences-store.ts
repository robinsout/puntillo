import { inject, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { Preferences } from '@/application/preferences'
import { canChange, type DifficultyChange, type Preset } from '@/domain/difficulty'
import type { Locale } from '@/domain/language'
import type { NoteNaming, SeventhNote } from '@/domain/naming'
import type { Exercise, NoteInput } from '@/domain/session'
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
  const noteInput = ref(preferences.noteInput)
  const playKeys = ref(preferences.playKeys)
  const shortcutsHintClosed = ref(preferences.shortcutsHintClosed)
  const useMidi = ref(preferences.useMidi)
  const midiSound = ref(preferences.midiSound)

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

  function chooseNoteInput(input: NoteInput) {
    preferences.chooseNoteInput(input)
    noteInput.value = preferences.noteInput
    refreshCanSave()
  }

  function choosePlayKeys(on: boolean) {
    preferences.choosePlayKeys(on)
    playKeys.value = preferences.playKeys
    refreshCanSave()
  }

  function chooseUseMidi(on: boolean) {
    preferences.chooseUseMidi(on)
    useMidi.value = preferences.useMidi
    refreshCanSave()
  }

  function chooseMidiSound(on: boolean) {
    preferences.chooseMidiSound(on)
    midiSound.value = preferences.midiSound
    refreshCanSave()
  }

  function closeShortcutsHint() {
    preferences.closeShortcutsHint()
    shortcutsHintClosed.value = preferences.shortcutsHintClosed
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
    noteInput.value = preferences.noteInput
    playKeys.value = preferences.playKeys
    shortcutsHintClosed.value = preferences.shortcutsHintClosed
    useMidi.value = preferences.useMidi
    midiSound.value = preferences.midiSound
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
    noteInput,
    playKeys,
    shortcutsHintClosed,
    useMidi,
    midiSound,
    chooseLanguage,
    chooseNoteNaming,
    chooseSeventhNote,
    chooseExercise,
    chooseShowNoteNames,
    chooseNoteInput,
    choosePlayKeys,
    chooseUseMidi,
    chooseMidiSound,
    closeShortcutsHint,
    choosePreset,
    customize,
    canCustomize,
    refreshCanSave,
    refresh,
  }
})
