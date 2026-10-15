<script setup lang="ts">
import { computed, onMounted, ref, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import { COMMON_TIME, createQuestionOf, signOf, type Question } from '@/domain/question'
import type { ReviewItem } from '@/domain/review-queue'
import type { ItemMistakes } from '@/domain/session'
import { StaffView } from '@/infrastructure/notation'
import { useItemText } from './mistake-item'
import { useSessionStore } from './session-store'

const props = defineProps<{ mistakes: readonly ItemMistakes[] }>()

const { t } = useI18n()
const store = useSessionStore()
const itemText = useItemText()
const headingId = useId()
const list = useTemplateRef('list')

// As the examples of the presets: a thumbnail of the clef and the note.
const STAFF_SCALE = 0.4

// As in the trainer, no retry after a failure; the lines work without their staves.
const staffFailed = ref(false)

// The note alone, its sign before it whatever the key it was asked in.
const questionOf = ({ pitch, duration }: ReviewItem): Question =>
  createQuestionOf(COMMON_TIME, [
    {
      pitch,
      duration,
      ...(pitch.alteration !== undefined && { accidental: signOf(pitch.alteration) }),
    },
  ])

// The links are numbered across the list, so that the one followed takes the focus on return.
const items = computed(() => {
  let link = 0
  return props.mistakes.map(({ item, count, topics }) => ({
    text: itemText(item),
    count: t('results.mistakeCount', count),
    question: questionOf(item),
    links: topics.map((topic) => ({ topic, index: link++ })),
  }))
})

onMounted(() => {
  const opener = store.takeResultsLink()
  if (opener !== null) list.value?.querySelectorAll('a')[opener]?.focus()
})
</script>

<template>
  <div class="most-mistakes">
    <h2 :id="headingId">{{ t('results.mostMistakes') }}</h2>
    <ul v-if="items.length > 0" ref="list" :aria-labelledby="headingId" class="mistakes">
      <li v-for="item in items" :key="item.text" class="mistake">
        <!-- The text of the line names the note: the staff is for the eye only. -->
        <div v-if="!staffFailed" class="staff" aria-hidden="true">
          <StaffView
            :question="item.question"
            :label="item.text"
            :drawing-scale="STAFF_SCALE"
            single-line
            hide-time-signature
            @load-error="staffFailed = true"
          />
        </div>
        <div class="body">
          <div class="text">
            <span class="item">{{ item.text }}</span>
            <span class="count">{{ item.count }}</span>
          </div>
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
        </div>
      </li>
    </ul>
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

.mistakes {
  margin: 0;
  padding: 0;
  border: var(--line-thin) solid var(--color-line);
  border-radius: var(--radius-l);
  background: var(--color-surface);
  list-style: none;
}

.mistake {
  display: flex;
  align-items: center;
  gap: var(--space-s);
  padding: var(--space-xs) var(--space-s);
}

.mistake + .mistake {
  border-top: var(--line-thin) solid var(--color-line);
}

.staff {
  flex: none;
  width: var(--width-example);
}

/* Short links stand right of the text; long ones wrap below it. */
.body {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  column-gap: var(--space-m);
  min-width: 0;
}

.text {
  display: flex;
  flex-direction: column;
  padding-block: var(--space-xs);
}

.item {
  font-weight: var(--font-weight-bold);
}

.count {
  color: var(--color-text-muted);
  font-size: var(--font-size-s);
}

.links {
  display: flex;
  flex-wrap: wrap;
  column-gap: var(--space-m);
}
</style>
