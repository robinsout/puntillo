<script setup lang="ts" generic="T">
import { useId } from 'vue'

defineProps<{
  label: string
  name: string
  options: readonly {
    readonly value: T
    readonly label: string
    readonly disabled?: boolean
    readonly description?: string
  }[]
}>()

const value = defineModel<T>({ required: true })
const descriptionId = useId()
</script>

<template>
  <fieldset class="ui-segmented">
    <legend class="visually-hidden">{{ label }}</legend>
    <!-- The reason stays outside the label, so that the name of the option is its label alone. -->
    <div v-for="(option, index) in options" :key="option.label" class="option">
      <label class="segment" :class="{ disabled: option.disabled }">
        <input
          type="radio"
          class="radio"
          :name="name"
          :checked="option.value === value"
          :disabled="option.disabled"
          :aria-describedby="option.description ? `${descriptionId}-${index}` : undefined"
          @change="value = option.value"
        />
        {{ option.label }}
      </label>
      <span v-if="option.description" :id="`${descriptionId}-${index}`" class="description">
        {{ option.description }}
      </span>
    </div>
  </fieldset>
</template>

<style scoped>
.ui-segmented {
  display: grid;
  grid-auto-columns: minmax(0, 1fr);
  grid-auto-flow: column;
  gap: var(--space-xs);
  min-width: 0;
  margin: 0;
  padding: var(--space-xs);
  border: 0;
  border-radius: var(--radius-m);
  background: var(--color-surface-sunken);
}

/* The radio is invisible over its whole segment, so the segment shows its state and its focus,
   and a press anywhere on the segment lands on the radio itself. */
.segment {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: var(--target-size);
  padding-inline: var(--space-s);
  border-radius: var(--radius-s);
  text-align: center;
  cursor: pointer;
}

.radio {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.option {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  min-width: 0;
}

.segment.disabled {
  opacity: var(--opacity-disabled);
  cursor: default;
}

.segment.disabled .radio {
  cursor: default;
}

.description {
  padding-inline: var(--space-xs);
  color: var(--color-text-muted);
  font-size: var(--font-size-s);
  text-align: center;
}

/* Chosen is not shown by colour alone: it is raised and bold. */
.segment:has(:checked) {
  background: var(--color-surface);
  box-shadow: var(--shadow-raised);
  font-weight: var(--font-weight-bold);
}

.segment:has(:focus-visible) {
  outline: var(--line-thick) solid var(--color-focus);
  outline-offset: var(--line-medium);
}
</style>
