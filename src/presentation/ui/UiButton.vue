<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'quiet'
    size?: 'm' | 'l'
    block?: boolean
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    to?: RouteLocationRaw
  }>(),
  { variant: 'secondary', size: 'm', type: 'button', to: undefined },
)

const emit = defineEmits<{ click: [event: MouseEvent] }>()

const button = useTemplateRef('button')
defineExpose({ focus: () => button.value?.focus() })

// Some engines still deliver a synthetic click to a disabled button.
function press(event: MouseEvent) {
  if (!props.disabled) emit('click', event)
}
</script>

<template>
  <RouterLink
    v-if="to !== undefined"
    :to="to"
    class="ui-button"
    :class="[variant, `size-${size}`, { block }]"
    @click="emit('click', $event)"
  >
    <slot />
  </RouterLink>
  <button
    v-else
    ref="button"
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
/* A link to another place, looking like the button. */
a.ui-button {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
}

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
