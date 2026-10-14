<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { UiButton, UiSection } from '@/presentation/ui'
import { useSessionStore } from './session-store'
import { useUnfinishedSessionText } from './unfinished-session'

const emit = defineEmits<{ discarded: [] }>()

const { t } = useI18n()
const store = useSessionStore()
const sessionText = useUnfinishedSessionText()

function discard() {
  store.discardSession()
  emit('discarded')
}
</script>

<template>
  <UiSection v-if="store.unfinishedSession" :title="t('progress.unfinishedSession')">
    <p>{{ sessionText(store.unfinishedSession) }}</p>
    <div class="actions">
      <UiButton @click="store.resume()">{{ t('progress.continue') }}</UiButton>
      <UiButton @click="discard">{{ t('progress.discard') }}</UiButton>
    </div>
  </UiSection>
</template>

<style scoped>
p {
  margin: 0;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-s);
}
</style>
