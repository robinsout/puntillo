<script setup lang="ts">
import { useId } from 'vue'
import UiIcon from './UiIcon.vue'

defineProps<{ title: string }>()

const expanded = defineModel<boolean>({ required: true })
const contentId = useId()
</script>

<template>
  <div class="ui-disclosure">
    <button
      type="button"
      class="header"
      :aria-expanded="expanded"
      :aria-controls="contentId"
      @click="expanded = !expanded"
    >
      {{ title }}
      <UiIcon name="chevron" class="chevron" />
    </button>
    <div v-if="expanded" :id="contentId" class="content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.ui-disclosure {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-s);
  width: 100%;
  padding-inline: 0;
  border-color: transparent;
  border-bottom: var(--line-thin) solid var(--color-line);
  border-radius: 0;
  background: transparent;
  font-family: var(--font-display);
  font-size: var(--font-size-l);
  font-weight: var(--font-weight-semibold);
  text-align: start;
}

.chevron {
  transition: transform var(--duration-enter) ease-out;
}

.header[aria-expanded='true'] .chevron {
  transform: rotate(90deg);
}

.content {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
}
</style>
