<script setup lang="ts">
import { computed, inject, onMounted, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { progressKey } from '@/presentation/dependencies'
import { useMistakeItemText } from '@/presentation/session'
import { useSessionRecordText } from './session-record'

const progress = inject(progressKey)
if (!progress) throw new Error('Progress is not provided: provide it with progressKey')

const { t } = useI18n()
const itemText = useMistakeItemText()
const recordText = useSessionRecordText()
const title = useTemplateRef('title')
const recentId = useId()
const hardestId = useId()

// The progress is not reactive, and needs not be: nothing is answered while the screen is open.
const recent = computed(() => progress.recentSessions.map(recordText))
const hardest = computed(() =>
  progress.hardestNotes.map(({ item, shown, mistakes }) =>
    itemText(item, t('progress.mistakesOf', { shown }, mistakes)),
  ),
)

onMounted(() => title.value?.focus())
</script>

<template>
  <main class="screen">
    <h1 ref="title" tabindex="-1">{{ t('progress.title') }}</h1>
    <h2 :id="recentId">{{ t('progress.recentSessions') }}</h2>
    <ul v-if="recent.length > 0" :aria-labelledby="recentId" class="list">
      <li v-for="(text, index) in recent" :key="index">{{ text }}</li>
    </ul>
    <p v-else>{{ t('progress.noSessions') }}</p>
    <h2 :id="hardestId">{{ t('progress.hardestNotes') }}</h2>
    <ul v-if="hardest.length > 0" :aria-labelledby="hardestId" class="list">
      <li v-for="text in hardest" :key="text">{{ text }}</li>
    </ul>
    <p v-else>{{ t('progress.noMistakes') }}</p>
    <RouterLink to="/" class="nav-link">{{ t('wiki.trainer') }}</RouterLink>
  </main>
</template>

<style scoped>
h2,
.list {
  margin: 0;
}
</style>
