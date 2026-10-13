<script setup lang="ts">
import { computed, inject, onMounted, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { progressKey } from '@/presentation/dependencies'
import { useMistakeItemText } from '@/presentation/session'

const progress = inject(progressKey)
if (!progress) throw new Error('Progress is not provided: provide it with progressKey')

const { t } = useI18n()
const itemText = useMistakeItemText()
const title = useTemplateRef('title')
const hardestId = useId()

// The progress is not reactive, and needs not be: nothing is answered while the screen is open.
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
    <h2 :id="hardestId">{{ t('progress.hardestNotes') }}</h2>
    <ul v-if="hardest.length > 0" :aria-labelledby="hardestId" class="hardest">
      <li v-for="text in hardest" :key="text">{{ text }}</li>
    </ul>
    <p v-else>{{ t('progress.noMistakes') }}</p>
    <RouterLink to="/" class="nav-link">{{ t('wiki.trainer') }}</RouterLink>
  </main>
</template>

<style scoped>
h2,
.hardest {
  margin: 0;
}
</style>
