<script setup lang="ts">
import type { AnswerMark } from './answer-mark'
import UiIcon from './UiIcon.vue'

const props = defineProps<{
  pressed: boolean
  mark: AnswerMark | null
  disabled?: boolean
}>()

const emit = defineEmits<{ click: [event: MouseEvent] }>()

// Some engines still deliver a synthetic click to a disabled button.
function press(event: MouseEvent) {
  if (!props.disabled) emit('click', event)
}
</script>

<template>
  <button
    type="button"
    class="ui-answer-key"
    :aria-pressed="pressed"
    :data-mark="mark ?? undefined"
    :disabled="disabled"
    @click="press"
  >
    <slot />
    <UiIcon v-if="mark === 'correct'" name="check" size="s" />
  </button>
</template>

<style scoped>
/* Positioned for the caption of the computer key in its corner. The check goes under the name
   when a narrow key has no room beside it. */
.ui-answer-key {
  position: relative;
  display: inline-flex;
  flex-wrap: wrap;
  place-content: center;
  align-items: center;
  column-gap: var(--space-xs);
}

/* A pressed key stays filled while disabled. */
.ui-answer-key:disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}

/* Marks rest on shape, not only on colour, and stay at full strength among disabled keys. */

/* The inset shadow thickens the solid frame without moving the name. */
.ui-answer-key[data-mark='correct'] {
  border-style: solid;
  border-color: var(--color-correct);
  box-shadow: inset 0 0 0 var(--line-thin) var(--color-correct);
  background: var(--color-correct-tint);
  color: var(--color-correct);
  font-weight: var(--font-weight-bold);
  opacity: 1;
}

.ui-answer-key[data-mark='wrong'] {
  border-style: dashed;
  border-color: var(--color-wrong);
  background: var(--color-wrong-tint);
  color: var(--color-wrong);
  font-weight: var(--font-weight-bold);
  text-decoration: line-through;
  opacity: 1;
}

/* Rejected on the first attempt: struck out in a dashed frame, pale as a disabled key. */
.ui-answer-key[data-mark='rejected'] {
  border-style: dashed;
  text-decoration: line-through;
}
</style>
