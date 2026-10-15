<template>
  <div class="staff-surface">
    <slot />
  </div>
</template>

<style scoped>
.staff-surface {
  padding: var(--space-s);
  border: var(--line-thin) solid var(--color-line);
  border-radius: var(--radius-l);
  background: var(--color-surface);
}
</style>
