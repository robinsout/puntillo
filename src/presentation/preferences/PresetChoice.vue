<script setup lang="ts">
import { nextTick, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { PRESETS, type Preset } from '@/domain/difficulty'
import CustomizePanel from './CustomizePanel.vue'
import { usePreferencesStore } from './preferences-store'

const { t } = useI18n()
const store = usePreferencesStore()
const modifiedId = useId()
const cards = useTemplateRef('cards')

const NAME_KEYS: Record<Preset, string> = {
  'first-steps': 'preset.firstSteps',
  'confident-reading': 'preset.confidentReading',
  advanced: 'preset.advanced',
}

// Reset disappears once pressed, so the focus goes to the card it reset.
async function reset() {
  store.choosePreset(store.preset)
  await nextTick()
  cards.value?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus()
}
</script>

<template>
  <div ref="cards" class="presets">
    <button
      v-for="preset in PRESETS"
      :key="preset"
      type="button"
      :aria-pressed="store.preset === preset"
      :aria-describedby="store.preset === preset && store.modified ? modifiedId : undefined"
      @click="store.choosePreset(preset)"
    >
      {{ t(NAME_KEYS[preset]) }}
    </button>
  </div>
  <p v-if="store.modified" class="modified">
    <span :id="modifiedId">{{ t('preset.modified') }}</span>
    <button type="button" @click="reset">{{ t('preset.reset') }}</button>
  </p>
  <CustomizePanel />
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

.modified {
  display: flex;
  align-items: center;
  gap: var(--space-s);
  margin: 0;
  color: var(--color-text-muted);
}
</style>
