<script setup lang="ts">
// Keys each in its own <kbd>, with the text that reads between them: "= / −", "A…J".
defineProps<{ keys: readonly string[]; between: string }>()
</script>

<template>
  <template v-for="(key, index) in keys" :key="key">
    <template v-if="index > 0">{{ between }}</template>
    <kbd class="ui-kbd">{{ key }}</kbd>
  </template>
</template>
