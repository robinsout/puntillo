<script setup lang="ts">
import { inject, ref, shallowRef, useTemplateRef } from 'vue'
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
import { UiButton, UiDialog, UiIcon } from '@/presentation/ui'

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
const opener = useTemplateRef('opener')
const asking = ref(false)
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
  asking.value = true
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
  asking.value = false
}

// Not every engine gives the focus back to the opener when a modal dialog closes.
function onClose() {
  chosen.value = null
  opener.value?.focus()
}
</script>

<template>
  <div class="actions">
    <UiButton @click="transfer.exportProgress()">
      {{ t('progress.exportProgress') }}
    </UiButton>
    <UiButton ref="opener" @click="input?.click()">
      {{ t('progress.importProgress') }}
    </UiButton>
    <input ref="input" type="file" accept=".json,application/json" hidden @change="onChoose" />
  </div>
  <!-- The region stays while empty, so that screen readers announce a message put into it. -->
  <div role="status">
    <p v-if="message" class="notice" :class="message === 'progress.imported' ? 'correct' : 'wrong'">
      <UiIcon :name="message === 'progress.imported' ? 'check' : 'cross'" />
      {{ t(message) }}
    </p>
  </div>
  <!-- A press on the backdrop closes it as Cancel does: nothing is replaced. -->
  <UiDialog v-model:open="asking" :title="t('progress.replaceQuestion')" @close="onClose">
    <template #actions>
      <UiButton variant="primary" @click="replace">{{ t('progress.replace') }}</UiButton>
      <UiButton @click="asking = false">{{ t('progress.cancel') }}</UiButton>
    </template>
  </UiDialog>
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

.notice {
  display: flex;
  align-items: center;
  gap: var(--space-s);
  padding: var(--space-s) var(--space-m);
  border: var(--line-thin) solid var(--color-line);
  border-radius: var(--radius-l);
  background: var(--color-surface);
}

.notice.correct {
  color: var(--color-correct);
}

.notice.wrong {
  color: var(--color-wrong);
}
</style>
