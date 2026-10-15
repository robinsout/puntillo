<script setup lang="ts" generic="T">
import { useId } from 'vue'

withDefaults(
  defineProps<{
    label: string
    labelHidden?: boolean
    name: string
    options: readonly {
      readonly value: T
      readonly label: string
      readonly display?: string
      readonly disabled?: boolean
      readonly description?: string
    }[]
    columns?: number
  }>(),
  { columns: 4 },
)

const value = defineModel<T>({ required: true })
const labelId = useId()
const descriptionId = useId()
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
      <!-- The reason stays outside the label, so that the name of the option is its label alone. -->
      <div v-for="(option, index) in options" :key="option.label" class="option">
        <label class="cell" :class="{ disabled: option.disabled }">
          <input
            type="radio"
            class="radio"
            :name="name"
            :checked="option.value === value"
            :disabled="option.disabled"
            :aria-label="option.display === undefined ? undefined : option.label"
            :aria-describedby="option.description ? `${descriptionId}-${index}` : undefined"
            @change="value = option.value"
          />
          {{ option.display ?? option.label }}
        </label>
        <span v-if="option.description" :id="`${descriptionId}-${index}`" class="description">
          {{ option.description }}
        </span>
      </div>
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

/* The radio is invisible over its whole cell, so the cell shows its state and its focus, and a
   press anywhere on the cell lands on the radio itself. */
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

.radio {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: inherit;
}

.cell.disabled {
  opacity: var(--opacity-disabled);
  cursor: default;
}

.option {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  min-width: 0;
}

.description {
  color: var(--color-text-muted);
  font-size: var(--font-size-s);
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
