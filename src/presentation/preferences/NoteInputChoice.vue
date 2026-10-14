<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NoteInput } from '@/domain/session'
import { UiSelect } from '@/presentation/ui'
import { usePreferencesStore } from './preferences-store'

const INPUTS: readonly { value: NoteInput; key: string }[] = [
  { value: 'names', key: 'preferences.noteInputNames' },
  { value: 'keyboard', key: 'preferences.noteInputKeyboard' },
]

const { t } = useI18n()
const store = usePreferencesStore()

const options = computed(() => INPUTS.map(({ value, key }) => ({ value, label: t(key) })))

const noteInput = computed({
  get: () => store.noteInput,
  set: (chosen: NoteInput) => store.chooseNoteInput(chosen),
})
</script>

<template>
  <UiSelect v-model="noteInput" :label="t('preferences.noteInput')" :options="options" />
</template>
