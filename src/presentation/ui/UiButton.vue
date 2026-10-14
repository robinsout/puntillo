<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'quiet'
    size?: 'm' | 'l'
    block?: boolean
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
  }>(),
  { variant: 'secondary', size: 'm', type: 'button' },
)

const emit = defineEmits<{ click: [event: MouseEvent] }>()

// Some engines still deliver a synthetic click to a disabled button.
function press(event: MouseEvent) {
  if (!props.disabled) emit('click', event)
}
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    class="ui-button"
    :class="[variant, `size-${size}`, { block }]"
    @click="press"
  >
    <slot />
  </button>
</template>

<style scoped>
.ui-button.primary:hover:not(:disabled) {
  border-color: var(--color-accent-hover);
  background: var(--color-accent-hover);
}

.ui-button.quiet {
  border-color: transparent;
  background: transparent;
}

.ui-button.size-l {
  min-height: var(--target-size-l);
  padding-inline: var(--space-m);
  font-size: var(--font-size-l);
  font-weight: var(--font-weight-bold);
}

.ui-button.block {
  width: 100%;
}

.ui-button:disabled {
  opacity: var(--opacity-disabled);
  cursor: default;
}
</style>
