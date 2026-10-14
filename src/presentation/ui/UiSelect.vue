<script setup lang="ts" generic="T extends string">
import { useId } from 'vue'

defineProps<{
  label: string
  options: readonly { readonly value: T; readonly label: string; readonly lang?: string }[]
}>()

const value = defineModel<T>({ required: true })
const id = useId()
</script>

<template>
  <div class="ui-select">
    <label :for="id">{{ label }}</label>
    <select :id="id" v-model="value">
      <option
        v-for="option in options"
        :key="option.value"
        :value="option.value"
        :lang="option.lang"
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
</style>
