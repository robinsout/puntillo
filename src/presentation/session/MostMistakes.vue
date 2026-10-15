<script setup lang="ts">
import { computed, onMounted, ref, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import type { ItemMistakes } from '@/domain/session'
import { UiList } from '@/presentation/ui'
import ItemLine from './ItemLine.vue'
import { useSessionStore } from './session-store'

const props = defineProps<{ mistakes: readonly ItemMistakes[] }>()

const { t } = useI18n()
const store = useSessionStore()
const headingId = useId()
const root = useTemplateRef('root')

// As in the trainer, no retry after a failure; the lines work without their staves.
const staffFailed = ref(false)

// The links are numbered across the list, so that the one followed takes the focus on return.
const lines = computed(() => {
  let link = 0
  return props.mistakes.map(({ item, count, topics }) => ({
    item,
    count: t('results.mistakeCount', count),
    links: topics.map((topic) => ({ topic, index: link++ })),
  }))
})

onMounted(() => {
  const opener = store.takeResultsLink()
  if (opener !== null) root.value?.querySelectorAll('a')[opener]?.focus()
})
</script>

<template>
  <div ref="root" class="most-mistakes">
    <h2 :id="headingId">{{ t('results.mostMistakes') }}</h2>
    <UiList v-if="lines.length > 0" :aria-labelledby="headingId">
      <ItemLine
        v-for="(line, index) in lines"
        :key="index"
        :item="line.item"
        :count="line.count"
        :staff="!staffFailed"
        @staff-failed="staffFailed = true"
      >
        <div class="links">
          <RouterLink
            v-for="{ topic, index: link } in line.links"
            :key="topic"
            :to="`/wiki/${topic}`"
            class="nav-link"
            @click="store.rememberResultsLink(link)"
          >
            {{ t(`wiki.topic.${topic}`) }}
          </RouterLink>
        </div>
      </ItemLine>
    </UiList>
    <p v-else>{{ t('results.noMistakes') }}</p>
  </div>
</template>

<style scoped>
.most-mistakes {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}

h2,
p {
  margin: 0;
}

.links {
  display: flex;
  flex-wrap: wrap;
  column-gap: var(--space-m);
}
</style>
