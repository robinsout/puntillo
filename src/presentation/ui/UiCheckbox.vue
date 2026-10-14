<script setup lang="ts">
// The description belongs to the box a screen reader lands on; any other attribute, such as
// data-sound-switch, goes on the label, so a press on the box or on its text finds it.
const props = defineProps<{ disabled?: boolean; ariaDescribedby?: string }>()

const checked = defineModel<boolean>({ required: true })

// A disabled box is not changed even by a synthetic click, which some engines still let through.
function change(event: Event) {
  const input = event.target as HTMLInputElement
  if (props.disabled) input.checked = checked.value
  else checked.value = input.checked
}
</script>

<template>
  <label class="ui-checkbox" :class="{ disabled }">
    <input
      type="checkbox"
      :checked="checked"
      :disabled="disabled"
      :aria-describedby="ariaDescribedby"
      @change="change"
    />
    <slot />
  </label>
</template>

<style scoped>
.ui-checkbox {
  display: flex;
  align-items: center;
  gap: var(--space-s);
  min-height: var(--target-size);
  cursor: pointer;
}

.ui-checkbox.disabled {
  opacity: var(--opacity-disabled);
  cursor: default;
}

input {
  width: 1.25em;
  height: 1.25em;
  margin: 0;
  cursor: inherit;
}
</style>
