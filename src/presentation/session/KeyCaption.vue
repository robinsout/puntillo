<script setup lang="ts">
import type { ShortcutKey } from './shortcuts'

// The button names the key for screen readers itself, with aria-keyshortcuts.
defineProps<{ of: ShortcutKey | undefined }>()
</script>

<template>
  <span v-if="of" class="key-caption" aria-hidden="true">{{ of.caption }}</span>
</template>

<style scoped>
/* In the corner of its button, out of the way of the name; the button is positioned. */
.key-caption {
  position: absolute;
  inset-block-start: calc(var(--space-s) / 4);
  inset-inline-end: calc(var(--space-s) / 2);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-regular);
  line-height: 1;
  opacity: 0.75;
}
</style>
