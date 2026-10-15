<template>
  <ul class="ui-list">
    <slot />
  </ul>
</template>

<style scoped>
.ui-list {
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: var(--line-thin) solid var(--color-line);
  border-radius: var(--radius-l);
  background: var(--color-surface);
  list-style: none;
}

.ui-list > :deep(* + *) {
  border-top: var(--line-thin) solid var(--color-line);
}
</style>
