<script setup lang="ts">
defineProps<{ label: string }>()

const emit = defineEmits<{ click: [event: MouseEvent] }>()
</script>

<template>
  <button type="button" class="ui-icon-button" :aria-label="label" @click="emit('click', $event)">
    <slot />
  </button>
</template>

<style scoped>
.ui-icon-button {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: var(--target-size);
  height: var(--target-size);
  padding: 0;
  border-radius: 50%;
  font-weight: var(--font-weight-bold);
}
</style>
