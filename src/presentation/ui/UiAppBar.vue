<script setup lang="ts">
import { RouterLink } from 'vue-router'
import UiLogo from './UiLogo.vue'

defineProps<{ title: string; to: string }>()
</script>

<template>
  <header class="ui-app-bar">
    <RouterLink :to="to" class="title"><UiLogo />{{ title }}</RouterLink>
    <slot />
  </header>
</template>

<style scoped>
.ui-app-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-m);
  min-height: var(--target-size);
  padding-block: max(var(--space-xs), env(safe-area-inset-top)) var(--space-xs);
  padding-inline: max(var(--space-m), env(safe-area-inset-left))
    max(var(--space-m), env(safe-area-inset-right));
  border-bottom: var(--line-thin) solid var(--color-line);
  background: var(--color-surface);
}

.title {
  display: inline-flex;
  align-items: center;
  gap: var(--space-s);
  min-height: var(--target-size);
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: var(--font-size-l);
  font-weight: var(--font-weight-semibold);
  text-decoration: none;
}
</style>
