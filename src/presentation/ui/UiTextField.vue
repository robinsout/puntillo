<script setup lang="ts">
import { useId } from 'vue'

withDefaults(defineProps<{ label: string; type?: 'text' | 'search' }>(), { type: 'text' })

const model = defineModel<string>({ required: true })

const fieldId = useId()
</script>

<template>
  <div class="ui-text-field">
    <label :for="fieldId">{{ label }}</label>
    <input :id="fieldId" v-model="model" :type="type" />
  </div>
</template>

<style scoped>
.ui-text-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

input {
  box-sizing: border-box;
  width: 100%;
  min-height: var(--target-size);
  padding-inline: var(--space-s);
  border: var(--line-medium) solid var(--color-border);
  border-radius: var(--radius-m);
  background: var(--color-surface);
  color: var(--color-text);
  font: inherit;
}
</style>
