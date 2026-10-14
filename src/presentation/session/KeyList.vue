<script setup lang="ts">
// Keys each in its own <kbd>, with the text that reads between them: "= / −", "A…J".
defineProps<{ keys: readonly string[]; between: string }>()
</script>

<template>
  <template v-for="(key, index) in keys" :key="key">
    <template v-if="index > 0">{{ between }}</template>
    <kbd>{{ key }}</kbd>
  </template>
</template>

<style scoped>
kbd {
  padding-inline: calc(var(--space-s) / 2);
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-s);
  font: inherit;
  white-space: nowrap;
}
</style>
