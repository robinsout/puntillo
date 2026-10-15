<script setup lang="ts" generic="T extends string">
import { useId } from 'vue'

defineProps<{
  label: string
  options: readonly {
    readonly value: T
    readonly label: string
    readonly lang?: string
    readonly disabled?: boolean
  }[]
  stacked?: boolean
}>()

const value = defineModel<T>({ required: true })
const id = useId()
</script>

<template>
  <div class="ui-select" :class="{ stacked }">
    <label :for="id">{{ label }}</label>
    <slot name="aside" />
    <select :id="id" v-model="value">
      <option
        v-for="option in options"
        :key="option.value"
        :value="option.value"
        :lang="option.lang"
        :disabled="option.disabled"
      >
        {{ option.label }}
      </option>
    </select>
  </div>
</template>

<style scoped>
.ui-select {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-s);
}

/* An option may name its reason, so the list would grow to its longest text without this. */
.stacked select {
  flex-basis: 100%;
  min-width: 0;
}
</style>
