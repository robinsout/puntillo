<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import ShortcutsDialog from './ShortcutsDialog.vue'

const { t } = useI18n()
const opener = useTemplateRef('opener')
const open = ref(false)

// Not every engine gives the focus back to the opener when a modal dialog closes.
function onClose() {
  open.value = false
  opener.value?.focus()
}
</script>

<template>
  <button ref="opener" type="button" class="link" @click="open = true">
    {{ t('shortcuts.title') }}
  </button>
  <ShortcutsDialog v-if="open" @close="onClose" />
</template>

<style scoped>
/* It opens a dialog, so it is a button, but it reads as the links beside it. */
.link {
  align-self: flex-start;
  padding-inline: 0;
  border-color: transparent;
  background: transparent;
  color: var(--color-accent);
  text-decoration: underline;
}
</style>
