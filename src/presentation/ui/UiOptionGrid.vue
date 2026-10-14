<script setup lang="ts" generic="T">
import { useId } from 'vue'

withDefaults(
  defineProps<{
    label: string
    labelHidden?: boolean
    name: string
    options: readonly { readonly value: T; readonly label: string; readonly display?: string }[]
    columns?: number
  }>(),
  { columns: 4 },
)

const value = defineModel<T>({ required: true })
const labelId = useId()
</script>

<template>
  <div class="ui-option-grid">
    <span v-if="!labelHidden" :id="labelId">{{ label }}</span>
    <div
      role="radiogroup"
      :aria-labelledby="labelHidden ? undefined : labelId"
      :aria-label="labelHidden ? label : undefined"
      class="cells"
      :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }"
    >
      <label v-for="option in options" :key="option.label" class="cell">
        <input
          type="radio"
          class="visually-hidden"
          :name="name"
          :checked="option.value === value"
          :aria-label="option.display === undefined ? undefined : option.label"
          @change="value = option.value"
        />
        {{ option.display ?? option.label }}
      </label>
    </div>
  </div>
</template>

<style scoped>
.ui-option-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}

.cells {
  display: grid;
  gap: var(--space-s);
}

/* The radio is hidden from the eye, so the cell shows its state and its focus. */
.cell {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: var(--target-size);
  min-height: var(--target-size);
  padding-inline: var(--space-s);
  border: var(--line-medium) solid var(--color-border);
  border-radius: var(--radius-m);
  background: var(--color-surface);
  cursor: pointer;
}

/* Chosen is not shown by colour alone: it is filled and bold. */
.cell:has(:checked) {
  border-color: var(--color-text);
  background: var(--color-text);
  color: var(--color-surface);
  font-weight: var(--font-weight-bold);
}

.cell:has(:focus-visible) {
  outline: var(--line-thick) solid var(--color-focus);
  outline-offset: var(--line-medium);
}
</style>
