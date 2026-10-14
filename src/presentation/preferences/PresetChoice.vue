<script setup lang="ts">
import { nextTick, reactive, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { PRESETS, type Preset } from '@/domain/difficulty'
import type { Locale } from '@/domain/language'
import { StaffView } from '@/infrastructure/notation'
import { UiChoiceCard } from '@/presentation/ui'
import CustomizePanel from './CustomizePanel.vue'
import { usePreferencesStore } from './preferences-store'
import { PRESET_EXAMPLES } from './preset-examples'
import { presetSummary } from './preset-summary'

const { t, locale } = useI18n()
const store = usePreferencesStore()
const modifiedId = useId()
const cards = useTemplateRef('cards')

const NAME_KEYS: Record<Preset, string> = {
  'first-steps': 'preset.firstSteps',
  'confident-reading': 'preset.confidentReading',
  advanced: 'preset.advanced',
}

// The example is a thumbnail: drawn this small, the clef, the signs and the note fit its width.
const EXAMPLE_SCALE = 0.4

// As in the trainer, no retry after a failure; the card works without its example.
const failedExamples = reactive(new Set<Preset>())

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
      <template v-if="!failedExamples.has(preset)" #media>
        <StaffView
          :question="PRESET_EXAMPLES[preset]"
          :label="t('preset.example')"
          :drawing-scale="EXAMPLE_SCALE"
          single-line
          @load-error="failedExamples.add(preset)"
        />
      </template>
    </UiChoiceCard>
  </div>
  <p v-if="store.modified" class="modified">
    <span :id="modifiedId">{{ t('preset.modified') }}</span>
    <button type="button" @click="reset">{{ t('preset.reset') }}</button>
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

.modified {
  display: flex;
  align-items: center;
  gap: var(--space-s);
  margin: 0;
  color: var(--color-text-muted);
}
</style>
