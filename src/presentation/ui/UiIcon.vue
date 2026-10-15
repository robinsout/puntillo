<script setup lang="ts">
import type { IconName } from './icon-name'

withDefaults(defineProps<{ name: IconName; size?: 'm' | 's' }>(), { size: 'm' })
</script>

<template>
  <svg
    class="ui-icon"
    :class="`size-${size}`"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="name === 'trainer'">
      <path d="M2 7h20M2 12h20M2 17h20" />
      <ellipse cx="9" cy="17" rx="3" ry="2.2" />
      <path d="M12 17V3" />
    </template>
    <template v-else-if="name === 'progress'">
      <path d="M3 21h18" />
      <rect x="5" y="12" width="3" height="9" />
      <rect x="10.5" y="7" width="3" height="14" />
      <rect x="16" y="3" width="3" height="18" />
    </template>
    <template v-else-if="name === 'wiki'">
      <path d="M12 6c-2-1.5-5-2-9-2v15c4 0 7 .5 9 2 2-1.5 5-2 9-2V4c-4 0-7 .5-9 2z" />
      <path d="M12 6v15" />
    </template>
    <template v-else-if="name === 'check'">
      <circle cx="12" cy="12" r="10" />
      <path d="m7.5 12.5 3 3 6-6.5" />
    </template>
    <path v-else-if="name === 'close'" d="M6 6l12 12M18 6 6 18" />
    <template v-else-if="name === 'cross'">
      <circle cx="12" cy="12" r="10" />
      <path d="m8.5 8.5 7 7m0-7-7 7" />
    </template>
    <path v-else-if="name === 'chevron'" d="m9 6 6 6-6 6" />
    <path v-else-if="name === 'back'" d="m15 6-6 6 6 6" />
    <template v-else>
      <circle cx="12" cy="12" r="3" />
      <path
        d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"
      />
      <circle cx="12" cy="12" r="7" />
    </template>
  </svg>
</template>

<style scoped>
.ui-icon {
  width: var(--icon-size);
  height: var(--icon-size);
  flex: none;
  stroke-width: var(--line-medium);
}

.ui-icon.size-s {
  width: var(--icon-size-s);
  height: var(--icon-size-s);
}
</style>
