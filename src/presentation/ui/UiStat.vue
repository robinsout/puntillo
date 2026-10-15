<script setup lang="ts">
defineProps<{ label: string; value?: string | number }>()
</script>

<template>
  <div class="ui-stat">
    <dt class="label">{{ label }}</dt>
    <dd class="value">
      <slot>{{ value }}</slot>
    </dd>
  </div>
</template>

<style scoped>
.ui-stat {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  min-width: 0;
  padding: var(--space-s);
  border: var(--line-thin) solid var(--color-line);
  border-radius: var(--radius-m);
  background: var(--color-surface);
}

.label {
  color: var(--color-text-muted);
  font-size: var(--font-size-s);
}

.value {
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-tight);
}
</style>
