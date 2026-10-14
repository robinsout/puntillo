<script setup lang="ts">
import { useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSessionStore } from './session-store'
import { useUnfinishedSessionText } from './unfinished-session'

const emit = defineEmits<{ discarded: [] }>()

const { t } = useI18n()
const store = useSessionStore()
const sessionText = useUnfinishedSessionText()
const headingId = useId()

function discard() {
  store.discardSession()
  emit('discarded')
}
</script>

<template>
  <section v-if="store.unfinishedSession" :aria-labelledby="headingId" class="unfinished">
    <h2 :id="headingId">{{ t('progress.unfinishedSession') }}</h2>
    <p>{{ sessionText(store.unfinishedSession) }}</p>
    <div class="actions">
      <button type="button" class="primary" @click="store.resume()">
        {{ t('progress.continue') }}
      </button>
      <button type="button" @click="discard">{{ t('progress.discard') }}</button>
    </div>
  </section>
</template>

<style scoped>
.unfinished {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}

h2,
p {
  margin: 0;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-s);
}
</style>
