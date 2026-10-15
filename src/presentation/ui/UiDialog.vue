<script lang="ts">
// The open dialogs, the topmost last. WebKit lets Tab into a modal dialog under another, so the
// ones below are made inert by hand.
const stack: HTMLDialogElement[] = []

function push(dialog: HTMLDialogElement) {
  stack.at(-1)?.toggleAttribute('inert', true)
  stack.push(dialog)
}

function remove(dialog: HTMLDialogElement) {
  const index = stack.indexOf(dialog)
  if (index === -1) return
  stack.splice(index, 1)
  stack.at(-1)?.toggleAttribute('inert', false)
}
</script>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, useId, useTemplateRef, watch } from 'vue'

withDefaults(defineProps<{ title: string; variant?: 'center' | 'sheet' }>(), {
  variant: 'center',
})

const emit = defineEmits<{ close: [] }>()

const open = defineModel<boolean>('open', { required: true })
const dialog = useTemplateRef('dialog')
const titleId = useId()

// The content renders with the value, so the dialog opens after it, its focus inside the content.
// The next tick also lets a screen that has just focused its heading do so first.
function showModal() {
  const element = dialog.value
  if (!open.value || !element || element.open) return
  push(element)
  element.showModal()
}

// Closed at once, so that a dialog opened right after it is not taken for the closing one.
function close() {
  if (dialog.value?.open) dialog.value.close()
}

onMounted(showModal)
watch(open, (value) => (value ? nextTick(showModal) : close()))
// Taken away open, as by a change of screen, it fires no close.
onBeforeUnmount(() => {
  if (dialog.value) remove(dialog.value)
})

// Esc, a press on the backdrop and a change of the value all end here.
function onClose() {
  if (dialog.value) remove(dialog.value)
  open.value = false
  emit('close')
}

// The padding is part of the dialog's box, so a press on the dialog itself counts as one on the
// backdrop only outside that box.
function onClick(event: MouseEvent) {
  const element = dialog.value
  if (!element || event.target !== element) return
  const box = element.getBoundingClientRect()
  const inside =
    event.clientX >= box.left &&
    event.clientX <= box.right &&
    event.clientY >= box.top &&
    event.clientY <= box.bottom
  if (!inside) element.close()
}
</script>

<template>
  <dialog
    ref="dialog"
    class="ui-dialog"
    :class="variant"
    :aria-labelledby="titleId"
    @close="onClose"
    @click="onClick"
  >
    <template v-if="open">
      <h2 :id="titleId" class="title">{{ title }}</h2>
      <div v-if="$slots.default" class="body">
        <slot />
      </div>
      <div v-if="$slots.actions" class="actions">
        <slot name="actions" />
      </div>
    </template>
  </dialog>
</template>

<style scoped>
.ui-dialog {
  box-sizing: border-box;
  max-width: none;
  padding: 0;
  border: none;
  color: var(--color-text);
  background: var(--color-surface);
}

/* The body scrolls between the title and the actions, so the actions stay in view. */
.ui-dialog[open] {
  display: flex;
  flex-direction: column;
  animation: ui-dialog-enter var(--duration-enter) ease-out;
}

.ui-dialog::backdrop {
  background: var(--color-scrim);
}

.title {
  margin: 0;
  font-size: var(--font-size-xl);
  padding: var(--space-l) var(--space-l) var(--space-m);
}

.body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: var(--space-m);
  min-height: 0;
  overflow-y: auto;
  padding-inline: var(--space-l);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-s);
  padding: var(--space-m) var(--space-l) var(--space-l);
}

.center {
  width: min(var(--width-dialog), 100% - 2 * var(--space-m));
  max-height: calc(100dvh - 2 * var(--space-m));
  border-radius: var(--radius-l);
  box-shadow: var(--shadow-dialog);
}

/* A bottom sheet on a narrow screen; the strip left above it is the backdrop to press. */
.sheet {
  width: 100%;
  max-height: calc(100dvh - var(--target-size));
  margin: auto 0 0;
  border-radius: var(--radius-l) var(--radius-l) 0 0;
}

.sheet .title,
.sheet .body,
.sheet .actions {
  padding-inline: max(var(--space-m), env(safe-area-inset-left))
    max(var(--space-m), env(safe-area-inset-right));
}

.sheet .body {
  padding-bottom: var(--space-m);
}

.sheet .actions {
  padding-bottom: max(var(--space-m), env(safe-area-inset-bottom));
  border-top: var(--line-thin) solid var(--color-line);
}

/* A side panel on a wide one, the page still in view beside it. */
@media (width >= 768px) {
  .sheet {
    width: var(--width-panel);
    height: 100dvh;
    max-height: 100dvh;
    margin: 0 0 0 auto;
    border-radius: 0;
  }

  .sheet .title,
  .sheet .body,
  .sheet .actions {
    padding-inline: var(--space-l);
  }

  .sheet .actions {
    padding-bottom: max(var(--space-l), env(safe-area-inset-bottom));
  }
}

/* A fade only: the dialog is where it will stay from the first frame. */
@keyframes ui-dialog-enter {
  from {
    opacity: 0;
  }
}
</style>
