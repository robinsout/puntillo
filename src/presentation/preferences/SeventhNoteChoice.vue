<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { SEVENTH_NOTES, type SeventhNote } from '@/domain/naming'
import { usePreferencesStore } from './preferences-store'

const { t } = useI18n()
const store = usePreferencesStore()
const group = useId()

const seventhNote = computed({
  get: () => store.seventhNote,
  set: (chosen: SeventhNote) => store.chooseSeventhNote(chosen),
})
</script>

<template>
  <fieldset class="seventh-note">
    <legend>{{ t('preferences.seventhNote') }}</legend>
    <label v-for="note in SEVENTH_NOTES" :key="note">
      <input v-model="seventhNote" type="radio" :name="group" :value="note" />
      {{ note }}
    </label>
  </fieldset>
</template>

<style scoped>
/* Floating legend keeps the group on one line, like the selects above. */
.seventh-note {
  display: flex;
  align-items: center;
  gap: var(--space-s);
  border: 0;
  padding: 0;
  margin: 0;
}

legend {
  float: left;
}

label {
  display: flex;
  align-items: center;
  gap: var(--space-s);
  min-width: var(--target-size);
  min-height: var(--target-size);
  cursor: pointer;
}

input {
  accent-color: var(--color-accent);
  cursor: pointer;
}
</style>
