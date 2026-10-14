<script setup lang="ts">
import { useId } from 'vue'

defineProps<{ title: string }>()

const headingId = useId()
</script>

<template>
  <section class="ui-section" :aria-labelledby="headingId">
    <h2 :id="headingId">{{ title }}</h2>
    <slot />
  </section>
</template>

<style scoped>
.ui-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
  padding: var(--space-m);
  border: var(--line-thin) solid var(--color-line);
  border-radius: var(--radius-l);
  background: var(--color-surface);
}

h2 {
  margin: 0;
  font-size: var(--font-size-l);
}
</style>
