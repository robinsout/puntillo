<script setup lang="ts">
import { computed } from 'vue'
import { COMMON_TIME, createQuestionOf, signOf, type Question } from '@/domain/question'
import type { ReviewItem } from '@/domain/review-queue'
import { StaffView } from '@/infrastructure/notation'
import { useItemText } from './mistake-item'

// The staves of a list fail to load together, so the list keeps whether they did.
const props = defineProps<{ item: ReviewItem; count: string; staff: boolean }>()
const emit = defineEmits<{ staffFailed: [] }>()

const itemText = useItemText()

// As the examples of the presets: a thumbnail of the clef and the note.
const STAFF_SCALE = 0.4

const text = computed(() => itemText(props.item))

// The note alone, its sign before it whatever the key it was asked in.
const question = computed((): Question => {
  const { pitch, duration } = props.item
  return createQuestionOf(COMMON_TIME, [
    {
      pitch,
      duration,
      ...(pitch.alteration !== undefined && { accidental: signOf(pitch.alteration) }),
    },
  ])
})
</script>

<template>
  <li class="item-line">
    <!-- The text of the line names the note: the staff is for the eye only. -->
    <div v-if="staff" class="staff" aria-hidden="true">
      <StaffView
        :question="question"
        :label="text"
        :drawing-scale="STAFF_SCALE"
        single-line
        hide-time-signature
        @load-error="emit('staffFailed')"
      />
    </div>
    <div class="body">
      <div class="text">
        <span class="item">{{ text }}</span>
        <span class="count">{{ count }}</span>
      </div>
      <slot />
    </div>
  </li>
</template>

<style scoped>
.item-line {
  display: flex;
  align-items: center;
  gap: var(--space-s);
  padding: var(--space-xs) var(--space-s);
}

.staff {
  flex: none;
  width: var(--width-example);
}

/* What the slot gives stands right of the text while it fits, below it when not. */
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
</style>
