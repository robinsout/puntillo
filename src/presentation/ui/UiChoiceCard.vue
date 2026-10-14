<script setup lang="ts">
import { computed, useId } from 'vue'
import UiIcon from './UiIcon.vue'

const props = defineProps<{
  pressed: boolean
  title: string
  description?: string
  // Ids of more descriptions outside the card, read after its own.
  describedBy?: string
}>()

const emit = defineEmits<{ click: [event: MouseEvent] }>()

const titleId = useId()
const descriptionId = useId()

const describedByIds = computed(
  () =>
    [props.description ? descriptionId : '', props.describedBy ?? ''].filter(Boolean).join(' ') ||
    undefined,
)
</script>

<template>
  <button
    type="button"
    class="ui-choice-card"
    :aria-pressed="pressed"
    :aria-labelledby="titleId"
    :aria-describedby="describedByIds"
    @click="emit('click', $event)"
  >
    <span v-if="$slots.media" class="media"><slot name="media" /></span>
    <span class="text">
      <span :id="titleId" class="title">{{ title }}</span>
      <span v-if="description" :id="descriptionId" class="description">{{ description }}</span>
    </span>
    <span v-if="pressed" class="mark" aria-hidden="true"><UiIcon name="check" /></span>
  </button>
</template>

<style scoped>
.ui-choice-card {
  display: flex;
  align-items: center;
  gap: var(--space-m);
  width: 100%;
  padding: var(--space-s) var(--space-m);
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-l);
  background: var(--color-surface);
  text-align: start;
}

/* The pressed look of a plain toggle in base.css would fill the whole card. An inset shadow
   thickens the border without moving the content. */
.ui-choice-card[aria-pressed='true'] {
  border-color: var(--color-accent);
  background: var(--color-surface);
  box-shadow: inset 0 0 0 calc(var(--line-medium) - var(--line-thin)) var(--color-accent);
  color: var(--color-text);
  font-weight: var(--font-weight-regular);
}

.media {
  flex: none;
  width: var(--width-example);
}

.text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.title {
  font-weight: var(--font-weight-bold);
}

.description {
  color: var(--color-text-muted);
  font-size: var(--font-size-s);
}

.mark {
  display: flex;
  flex: none;
  color: var(--color-accent);
}
</style>
