<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NoteInput } from '@/domain/session'
import { useMicrophone } from '@/presentation/dependencies'
import { UiSelect } from '@/presentation/ui'
import { usePreferencesStore } from './preferences-store'

const INPUTS: readonly { value: NoteInput; key: string }[] = [
  { value: 'names', key: 'preferences.noteInputNames' },
  { value: 'keyboard', key: 'preferences.noteInputKeyboard' },
  { value: 'microphone', key: 'preferences.noteInputMicrophone' },
]

const { t } = useI18n()
const store = usePreferencesStore()
const microphone = useMicrophone()

const options = computed(() => INPUTS.map(({ value, key }) => ({ value, label: t(key) })))

const noteInput = computed({
  get: () => store.noteInput,
  set: (chosen: NoteInput) => {
    store.chooseNoteInput(chosen)
    // Asked on the choice, so that the browser's own question does not interrupt the first note.
    if (chosen === 'microphone') microphone.requestAccess()
  },
})
</script>

<template>
  <UiSelect v-model="noteInput" :label="t('preferences.noteInput')" :options="options" />
</template>
