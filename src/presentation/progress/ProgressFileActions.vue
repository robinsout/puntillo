<script setup lang="ts">
import { inject, nextTick, ref, shallowRef, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { createProgressTransfer } from '@/application/progress'
import type { ProgressFile } from '@/domain/progress'
import {
  fileSaverKey,
  preferencesKey,
  progressKey,
  wallClockKey,
} from '@/presentation/dependencies'
import { usePreferencesStore } from '@/presentation/preferences'

const emit = defineEmits<{ imported: [] }>()

const preferences = inject(preferencesKey)
if (!preferences) throw new Error('Preferences are not provided: provide them with preferencesKey')
const progress = inject(progressKey)
if (!progress) throw new Error('Progress is not provided: provide it with progressKey')
const wallClock = inject(wallClockKey)
if (!wallClock) throw new Error('Wall clock is not provided: provide it with wallClockKey')
const saver = inject(fileSaverKey)
if (!saver) throw new Error('File saver is not provided: provide it with fileSaverKey')

const transfer = createProgressTransfer(preferences, progress, wallClock, saver)
const preferencesStore = usePreferencesStore()
const { t, locale } = useI18n()

const input = useTemplateRef('input')
const dialog = useTemplateRef('dialog')
const opener = useTemplateRef('opener')
const questionId = useId()
const chosen = shallowRef<ProgressFile | null>(null)
const message = ref<'progress.imported' | 'progress.rejected' | null>(null)

async function onChoose() {
  const file = input.value?.files?.[0]
  if (!file) return
  const text = await file.text()
  // Cleared, so that choosing the same file again is a change too.
  if (input.value) input.value.value = ''
  message.value = null
  chosen.value = transfer.readProgressFile(text)
  if (!chosen.value) {
    message.value = 'progress.rejected'
    return
  }
  await nextTick()
  dialog.value?.showModal()
}

// Arrow functions, unlike hoisted declarations, keep the preferences narrowed as provided.
const replace = () => {
  if (!chosen.value) return
  transfer.importProgress(chosen.value)
  const { language } = preferences
  locale.value = language
  document.documentElement.lang = language
  preferencesStore.refresh()
  message.value = 'progress.imported'
  emit('imported')
  dialog.value?.close()
}

// Not every engine gives the focus back to the opener when a modal dialog closes.
function onClose() {
  chosen.value = null
  opener.value?.focus()
}
</script>

<template>
  <div class="actions">
    <button type="button" @click="transfer.exportProgress()">
      {{ t('progress.exportProgress') }}
    </button>
    <button ref="opener" type="button" @click="input?.click()">
      {{ t('progress.importProgress') }}
    </button>
    <input ref="input" type="file" accept=".json,application/json" hidden @change="onChoose" />
  </div>
  <p role="status">{{ message && t(message) }}</p>
  <dialog ref="dialog" class="confirmation" :aria-labelledby="questionId" @close="onClose">
    <div v-if="chosen" class="content">
      <p :id="questionId">{{ t('progress.replaceQuestion') }}</p>
      <div class="actions">
        <button type="button" class="primary" @click="replace">{{ t('progress.replace') }}</button>
        <button type="button" @click="dialog?.close()">{{ t('progress.cancel') }}</button>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-s);
}

p {
  margin: 0;
}

.confirmation {
  box-sizing: border-box;
  width: min(32rem, 100% - 2 * var(--space-m));
  max-width: none;
  padding: 0;
  border: none;
  border-radius: var(--radius);
  color: var(--color-text);
  background: var(--color-surface);
}

.confirmation::backdrop {
  background: rgb(0 0 0 / 0.4);
}

.content {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
  padding: var(--space-m);
}
</style>
