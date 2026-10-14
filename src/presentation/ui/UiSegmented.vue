<script setup lang="ts" generic="T">
defineProps<{
  label: string
  name: string
  options: readonly { readonly value: T; readonly label: string }[]
}>()

const value = defineModel<T>({ required: true })
</script>

<template>
  <fieldset class="ui-segmented">
    <legend class="visually-hidden">{{ label }}</legend>
    <label v-for="option in options" :key="option.label" class="segment">
      <input
        type="radio"
        class="radio"
        :name="name"
        :checked="option.value === value"
        @change="value = option.value"
      />
      {{ option.label }}
    </label>
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
