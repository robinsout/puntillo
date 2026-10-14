<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import type { NoteInput } from '@/domain/session'
import { usePreferencesStore } from './preferences-store'

const INPUTS: Record<NoteInput, string> = {
  names: 'preferences.noteInputNames',
  keyboard: 'preferences.noteInputKeyboard',
}

const { t } = useI18n()
const store = usePreferencesStore()
const id = useId()

const noteInput = computed({
  get: () => store.noteInput,
  set: (chosen: NoteInput) => store.chooseNoteInput(chosen),
})
</script>

<template>
  <div class="note-input">
    <label :for="id">{{ t('preferences.noteInput') }}</label>
    <select :id="id" v-model="noteInput">
      <option v-for="(name, input) in INPUTS" :key="input" :value="input">
        {{ t(name) }}
      </option>
    </select>
  </div>
</template>

<style scoped>
.note-input {
  display: flex;
  align-items: center;
  gap: var(--space-s);
}
</style>
