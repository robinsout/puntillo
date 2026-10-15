<script setup lang="ts">
import { computed, inject, onMounted, ref, shallowRef, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { progressKey } from '@/presentation/dependencies'
import { ItemLine } from '@/presentation/session'
import { UiList } from '@/presentation/ui'
import ProgressFileActions from './ProgressFileActions.vue'
import { useSessionRecordParts } from './session-record'

const progress = inject(progressKey)
if (!progress) throw new Error('Progress is not provided: provide it with progressKey')

const SEPARATOR = ' · '

const { t } = useI18n()
const recordParts = useSessionRecordParts()
const title = useTemplateRef('title')
const recentId = useId()
const hardestId = useId()

// As in the trainer, no retry after a failure; the lines work without their staves.
const staffFailed = ref(false)

// The progress is not reactive: nothing is answered while the screen is open, but a file can be
// imported, and then it is read again.
const recentSessions = shallowRef(progress.recentSessions)
const hardestNotes = shallowRef(progress.hardestNotes)
const onImported = () => {
  recentSessions.value = progress.recentSessions
  hardestNotes.value = progress.hardestNotes
}

const recent = computed(() =>
  recentSessions.value.map((record) => {
    const { date, details, accuracy } = recordParts(record)
    return { date, details: details.map((detail) => SEPARATOR + detail).join(''), accuracy }
  }),
)
const hardest = computed(() =>
  hardestNotes.value.map(({ item, shown, mistakes }) => ({
    item,
    count: t('progress.mistakesOf', { shown }, mistakes),
  })),
)

onMounted(() => title.value?.focus())
</script>

<template>
  <main class="screen">
    <h1 ref="title" tabindex="-1">{{ t('progress.title') }}</h1>
    <div class="part">
      <h2 :id="recentId">{{ t('progress.recentSessions') }}</h2>
      <UiList v-if="recent.length > 0" :aria-labelledby="recentId">
        <li v-for="(record, index) in recent" :key="index" class="session">
          <span class="summary">
            <span class="date">{{ record.date }}</span>
            <span class="details">{{ record.details }}</span>
          </span>
          <!-- Read between the parts, so the line says the same as before it was laid out. -->
          <span class="visually-hidden">{{ SEPARATOR }}</span>
          <strong class="accuracy">{{ record.accuracy }}</strong>
        </li>
      </UiList>
      <p v-else class="empty">{{ t('progress.noSessions') }}</p>
    </div>
    <div class="part">
      <h2 :id="hardestId">{{ t('progress.hardestNotes') }}</h2>
      <UiList v-if="hardest.length > 0" :aria-labelledby="hardestId">
        <ItemLine
          v-for="(line, index) in hardest"
          :key="index"
          :item="line.item"
          :count="line.count"
          :staff="!staffFailed"
          @staff-failed="staffFailed = true"
        />
      </UiList>
      <p v-else class="empty">{{ t('progress.noMistakes') }}</p>
    </div>
    <ProgressFileActions @imported="onImported" />
  </main>
</template>

<style scoped>
.part {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}

h2 {
  margin: 0;
}

.session {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-m);
  padding: var(--space-s) var(--space-m);
}

.summary {
  min-width: 0;
}

.details {
  color: var(--color-text-soft);
}

.accuracy {
  flex: none;
}

.empty {
  margin: 0;
  padding: var(--space-s) var(--space-m);
  border: var(--line-thin) solid var(--color-line);
  border-radius: var(--radius-l);
  background: var(--color-surface);
  color: var(--color-text-soft);
  font-size: var(--font-size-s);
}
</style>
