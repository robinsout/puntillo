<script setup lang="ts">
import { nextTick, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { PRESETS, type Preset } from '@/domain/difficulty'
import type { Locale } from '@/domain/language'
import { UiButton, UiChoiceCard } from '@/presentation/ui'
import CustomizePanel from './CustomizePanel.vue'
import { usePreferencesStore } from './preferences-store'
import { presetSummary } from './preset-summary'
import advancedExample from './preset-examples/advanced.svg?raw'
import confidentReadingExample from './preset-examples/confident-reading.svg?raw'
import firstStepsExample from './preset-examples/first-steps.svg?raw'

const { t, locale } = useI18n()
const store = usePreferencesStore()
const modifiedId = useId()
const cards = useTemplateRef('cards')

const NAME_KEYS: Record<Preset, string> = {
  'first-steps': 'preset.firstSteps',
  'confident-reading': 'preset.confidentReading',
  advanced: 'preset.advanced',
}

// Drawn beforehand from StaffView by npm run render:examples, so that the start screen needs no
// VexFlow (spec §18). The markup is part of the build, not the user's.
const EXAMPLES: Record<Preset, string> = {
  'first-steps': firstStepsExample,
  'confident-reading': confidentReadingExample,
  advanced: advancedExample,
}

const summary = (preset: Preset) =>
  presetSummary(preset, store, { locale: locale.value as Locale, t })

// The card of the preset changed is no longer chosen, yet it tells which values were changed.
const describedBy = (preset: Preset) =>
  store.modified && store.preset === preset ? modifiedId : undefined

// Reset disappears once pressed, so the focus goes to the card it reset.
async function reset() {
  store.choosePreset(store.preset)
  await nextTick()
  cards.value?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus()
}
</script>

<template>
  <div class="level">
    <h2>{{ t('session.level') }}</h2>
    <CustomizePanel />
  </div>
  <div ref="cards" class="presets">
    <UiChoiceCard
      v-for="preset in PRESETS"
      :key="preset"
      :pressed="!store.modified && store.preset === preset"
      :title="t(NAME_KEYS[preset])"
      :description="summary(preset)"
      :described-by="describedBy(preset)"
      @click="store.choosePreset(preset)"
    >
      <template #media>
        <span
          class="example"
          role="img"
          :aria-label="t('preset.example')"
          v-html="EXAMPLES[preset]"
        />
      </template>
    </UiChoiceCard>
  </div>
  <p v-if="store.modified" class="modified">
    <span :id="modifiedId">{{ t('preset.modified') }}</span>
    <UiButton variant="quiet" @click="reset">{{ t('preset.reset') }}</UiButton>
  </p>
</template>

<style scoped>
.level {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-s);
}

h2 {
  margin: 0;
}

.presets {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}

.example,
.example :deep(svg) {
  display: block;
}

.example :deep(svg) {
  width: 100%;
  height: auto;
}

.modified {
  display: flex;
  align-items: center;
  gap: var(--space-s);
  margin: 0;
  color: var(--color-text-muted);
}
</style>
