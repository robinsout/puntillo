<script setup lang="ts">
import { RouterLink } from 'vue-router'
import type { IconName } from './icon-name'
import UiIcon from './UiIcon.vue'

defineProps<{
  label: string
  items: readonly { to: string; label: string; icon: IconName; current: boolean }[]
}>()
</script>

<template>
  <nav class="ui-nav-bar" :aria-label="label">
    <!-- Custom: the router marks only the exact address, and Wiki is current on /wiki/keys too. -->
    <RouterLink
      v-for="item in items"
      :key="item.to"
      v-slot="{ href, navigate }"
      :to="item.to"
      custom
    >
      <a
        :href="href"
        class="item"
        :aria-current="item.current ? 'page' : undefined"
        @click="navigate"
      >
        <UiIcon :name="item.icon" />
        <span>{{ item.label }}</span>
      </a>
    </RouterLink>
  </nav>
</template>

<style scoped>
.ui-nav-bar {
  display: flex;
  gap: var(--space-xs);
}

.item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--target-size);
  min-height: var(--target-size);
  padding-inline: var(--space-s);
  border-radius: var(--radius-m);
  color: var(--color-text-soft);
  text-decoration: none;
}

.item[aria-current='page'] {
  color: var(--color-accent);
  font-weight: var(--font-weight-bold);
}

/* Beside the title the names are enough, the icons would crowd the row. */
@media (width >= 768px) {
  .item .ui-icon {
    display: none;
  }

  .item[aria-current='page'] {
    background: var(--color-surface-sunken);
  }
}

/* At the bottom for the thumb; the markup stays in the header, so Tab still meets it first. */
@media (width < 768px) {
  .ui-nav-bar {
    position: fixed;
    inset-inline: 0;
    bottom: 0;
    z-index: 1;
    gap: 0;
    padding-bottom: env(safe-area-inset-bottom);
    padding-inline: env(safe-area-inset-left) env(safe-area-inset-right);
    border-top: var(--line-thin) solid var(--color-line);
    background: var(--color-surface);
  }

  .item {
    flex: 1 1 0;
    flex-direction: column;
    min-width: 0;
    height: var(--target-size-tab);
    padding-inline: var(--space-xs);
    border-radius: 0;
    font-size: var(--font-size-xs);
  }

  .item[aria-current='page'] {
    box-shadow: inset 0 var(--line-thick) 0 var(--color-accent);
  }
}
</style>
