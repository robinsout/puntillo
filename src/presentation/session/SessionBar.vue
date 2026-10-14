<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { accuracyPercent, type Score } from '@/domain/session'
import { UiButton, UiIcon, UiProgress } from '@/presentation/ui'
import { useSessionBar, type Progress } from './progress'

const props = defineProps<{ progress: Progress & { readonly score: Score } }>()
const emit = defineEmits<{ finish: [] }>()

const { t } = useI18n()
const shown = useSessionBar(toRef(props, 'progress'))

const accuracy = computed(() => {
  const percent = accuracyPercent(props.progress.score)
  return percent === null ? t('session.noAccuracy') : t('session.accuracy', { percent })
})
</script>

<template>
  <div v-if="shown" class="session-bar">
    <div class="top">
      <UiButton
        variant="quiet"
        class="finish"
        :aria-label="t('session.finish')"
        @click="emit('finish')"
      >
        <UiIcon name="close" />
      </UiButton>
      <UiProgress v-if="shown.bar" class="bar" v-bind="shown.bar" />
      <span class="count" :class="{ alone: !shown.bar }">{{ shown.count }}</span>
    </div>
    <p class="score">
      <span>{{ accuracy }}</span>
      <span>{{ t('session.streak', { count: progress.score.streak }) }}</span>
    </p>
  </div>
</template>

<style scoped>
.session-bar {
  display: flex;
  flex-direction: column;
}

.top {
  display: flex;
  align-items: center;
  gap: var(--space-s);
}

/* The icon lines up with the left edge of the column under it. */
.finish {
  display: grid;
  place-items: center;
  margin-inline-start: calc(-1 * var(--space-s));
  padding: 0;
  color: var(--color-text-soft);
}

.bar {
  flex: 1;
}

.count {
  color: var(--color-text-soft);
  font-size: var(--font-size-s);
  font-variant-numeric: tabular-nums;
}

.count.alone {
  flex: 1;
}

.score {
  display: flex;
  flex-wrap: wrap;
  column-gap: var(--space-m);
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-s);
}
</style>
