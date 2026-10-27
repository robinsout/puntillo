<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PitchReading } from '@/application/hearing'
import { useNoteNames } from './note-names'

const props = defineProps<{ reading: PitchReading | null }>()

const { t } = useI18n()
const { keyCaption, lang } = useNoteNames()

const cents = computed(() => {
  const value = props.reading?.cents ?? 0
  if (value > 0) return { shown: `↑ ${value}`, read: t('trainer.centsHigher', value) }
  if (value < 0) return { shown: `↓ ${-value}`, read: t('trainer.centsLower', -value) }
  return { shown: '0', read: t('trainer.inTune') }
})
</script>

<!-- Not a live region: it changes up to ten times a second, too often to be read out. -->
<template>
  <p class="hearing-indicator" data-testid="hearing-indicator">
    <template v-if="reading">
      <span class="note" :lang="lang">{{ keyCaption(reading.key) }}</span>
      {{ ' ' }}
      <span class="cents" aria-hidden="true">{{ cents.shown }}</span>
      {{ ' ' }}
      <span class="visually-hidden">{{ cents.read }}</span>
    </template>
  </p>
</template>

<style scoped>
/* The line keeps its height in silence, so the staff under it does not move. */
.hearing-indicator {
  display: flex;
  align-items: baseline;
  gap: var(--space-s);
  min-height: 1lh;
  margin: 0;
  font-size: var(--font-size-xxl);
  line-height: var(--line-height-tight);
}

.note {
  font-family: var(--font-display);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
}

.cents {
  min-width: 3ch;
  font-size: var(--font-size-l);
  font-variant-numeric: tabular-nums;
  color: var(--color-text-soft);
}
</style>
