<script setup lang="ts">
import { computed, onMounted, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { noteName } from '@/domain/naming'
import type { ItemMistakes } from '@/domain/session'
import { usePreferencesStore } from '@/presentation/preferences'
import { useSessionStore } from './session-store'

const props = defineProps<{ mistakes: readonly ItemMistakes[] }>()

const { t } = useI18n()
const store = useSessionStore()
const preferences = usePreferencesStore()
const headingId = useId()
const list = useTemplateRef('list')

const durationName = ({ value, dots }: ItemMistakes['item']['duration']) =>
  t(`writing.${dots ? 'taskDottedDuration' : 'taskDuration'}.${value}`)

// The links are numbered across the list, so that the one followed takes the focus on return.
const items = computed(() => {
  let link = 0
  return props.mistakes.map(({ item: { pitch, duration }, count, topics }) => ({
    text: t('results.mistakeItem', {
      name: `${noteName(pitch.letter, preferences.noteNaming, preferences.seventhNote, pitch.alteration)}${pitch.octave}`,
      duration: durationName(duration),
      mistakes: t('results.mistakeCount', count),
    }),
    links: topics.map((topic) => ({ topic, index: link++ })),
  }))
})

onMounted(() => {
  const opener = store.takeResultsLink()
  if (opener !== null) list.value?.querySelectorAll('a')[opener]?.focus()
})
</script>

<template>
  <h2 :id="headingId">{{ t('results.mostMistakes') }}</h2>
  <ul v-if="items.length > 0" ref="list" :aria-labelledby="headingId" class="mistakes">
    <li v-for="item in items" :key="item.text">
      {{ item.text }}
      <div class="links">
        <RouterLink
          v-for="{ topic, index } in item.links"
          :key="topic"
          :to="`/wiki/${topic}`"
          class="nav-link"
          @click="store.rememberResultsLink(index)"
        >
          {{ t(`wiki.topic.${topic}`) }}
        </RouterLink>
      </div>
    </li>
  </ul>
  <p v-else>{{ t('results.noMistakes') }}</p>
</template>

<style scoped>
h2 {
  margin: 0;
}

.mistakes {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
  margin: 0;
  padding: 0;
  list-style: none;
}

.links {
  display: flex;
  flex-wrap: wrap;
  column-gap: var(--space-m);
}
</style>
