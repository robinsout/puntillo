<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { EXERCISES, type Exercise } from '@/domain/session'
import { EXERCISE_NAME_KEYS } from './exercise-name'
import { usePreferencesStore } from './preferences-store'

const { t } = useI18n()
const store = usePreferencesStore()
const group = useId()

const exercise = computed({
  get: () => store.exercise,
  set: (chosen: Exercise) => store.chooseExercise(chosen),
})
</script>

<template>
  <fieldset class="exercise">
    <legend>{{ t('session.exercise') }}</legend>
    <label v-for="each in EXERCISES" :key="each">
      <input v-model="exercise" type="radio" :name="group" :value="each" />
      {{ t(EXERCISE_NAME_KEYS[each]) }}
    </label>
  </fieldset>
</template>

<style scoped>
/* Floating legend keeps the group on one line where it fits, like the seventh note choice. */
.exercise {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: var(--space-m);
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
