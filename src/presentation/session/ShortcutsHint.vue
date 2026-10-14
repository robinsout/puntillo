<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ShortcutsButton from './ShortcutsButton.vue'

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
</script>

<template>
  <div class="shortcuts-hint">
    <p>{{ t('shortcuts.hint') }}</p>
    <ShortcutsButton />
    <button type="button" class="close" @click="emit('close')">
      {{ t('shortcuts.close') }}
    </button>
  </div>
</template>

<style scoped>
.shortcuts-hint {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: var(--space-m);
  padding: var(--space-s) var(--space-m);
  border: var(--line-thin) solid var(--color-border);
  border-radius: var(--radius-m);
}

p {
  flex-basis: 100%;
  margin: 0;
}

.close {
  margin-inline-start: auto;
}
</style>
