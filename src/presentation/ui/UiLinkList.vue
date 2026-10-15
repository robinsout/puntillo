<script setup lang="ts">
import { RouterLink } from 'vue-router'
import UiIcon from './UiIcon.vue'
import UiList from './UiList.vue'

defineProps<{ items: readonly { to: string; label: string }[] }>()
</script>

<template>
  <UiList class="ui-link-list">
    <li v-for="item in items" :key="item.to">
      <RouterLink :to="item.to" class="link">
        <span class="label">{{ item.label }}</span>
        <UiIcon name="chevron" class="chevron" />
      </RouterLink>
    </li>
  </UiList>
</template>

<style scoped>
.link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-s);
  min-height: var(--target-size);
  padding: var(--space-xs) var(--space-s) var(--space-xs) var(--space-m);
  color: var(--color-text);
  text-decoration: none;
}

.link:hover {
  background: var(--color-surface-sunken);
}

/* The list clips its corners, so the ring of focus is drawn inside the line. */
.link:focus-visible {
  outline-offset: calc(-1 * var(--line-thick));
}

.label {
  min-width: 0;
  overflow-wrap: anywhere;
}

.chevron {
  color: var(--color-text-muted);
}
</style>
