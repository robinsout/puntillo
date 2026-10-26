<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Tuning } from '@/domain/hearing'
import { UiSelect } from '@/presentation/ui'
import { usePreferencesStore } from './preferences-store'

const TUNINGS: readonly { value: Tuning; key: string }[] = [
  { value: 'c', key: 'preferences.tuningC' },
  { value: 'b-flat', key: 'preferences.tuningBFlat' },
]

const { t } = useI18n()
const store = usePreferencesStore()

const options = computed(() => TUNINGS.map(({ value, key }) => ({ value, label: t(key) })))

const tuning = computed({
  get: () => store.tuning,
  set: (chosen: Tuning) => store.chooseTuning(chosen),
})
</script>

<template>
  <UiSelect v-model="tuning" :label="t('preferences.tuning')" :options="options" />
</template>
