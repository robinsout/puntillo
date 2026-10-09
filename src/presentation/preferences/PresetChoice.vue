<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { PRESETS, type Preset } from '@/domain/difficulty'
import { usePreferencesStore } from './preferences-store'

const { t } = useI18n()
const store = usePreferencesStore()

const NAME_KEYS: Record<Preset, string> = {
  'first-steps': 'preset.firstSteps',
  'confident-reading': 'preset.confidentReading',
  advanced: 'preset.advanced',
}
</script>

<template>
  <div class="presets">
    <button
      v-for="preset in PRESETS"
      :key="preset"
      type="button"
      :aria-pressed="store.preset === preset"
      @click="store.choosePreset(preset)"
    >
      {{ t(NAME_KEYS[preset]) }}
    </button>
  </div>
</template>

<style scoped>
.presets {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-s);
}

.presets button {
  flex: 1 0 auto;
}
</style>
