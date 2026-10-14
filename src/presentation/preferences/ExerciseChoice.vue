<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { EXERCISES, type Exercise } from '@/domain/session'
import { UiSegmented } from '@/presentation/ui'
import { EXERCISE_NAME_KEYS } from './exercise-name'
import { usePreferencesStore } from './preferences-store'

const { t } = useI18n()
const store = usePreferencesStore()
const group = useId()

const exercise = computed({
  get: () => store.exercise,
  set: (chosen: Exercise) => store.chooseExercise(chosen),
})

const options = computed(() =>
  EXERCISES.map((value) => ({ value, label: t(EXERCISE_NAME_KEYS[value]) })),
)
</script>

<template>
  <UiSegmented v-model="exercise" :label="t('session.exercise')" :name="group" :options="options" />
</template>
