<script setup lang="ts">
import { computed, nextTick, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { accuracyPercent, averageTimeMs, SESSION_LENGTHS } from '@/domain/session'
import type { SessionLength } from '@/domain/session'
import { LanguageChoice } from '@/presentation/preferences'
import QuestionScreen from './QuestionScreen.vue'
import { useSessionStore } from './session-store'

const { t, locale } = useI18n()
const store = useSessionStore()

const root = useTemplateRef('root')

const lengthName = (length: SessionLength) =>
  length === 'unlimited' ? t('session.unlimited') : String(length)

const results = computed(() => {
  const { state } = store
  if (state.phase !== 'results') return null
  const averageMs = averageTimeMs(state.score)
  return {
    score: state.score,
    percent: accuracyPercent(state.score),
    averageSeconds: averageMs === null ? null : formatSeconds(averageMs / 1000),
  }
})

function formatSeconds(seconds: number) {
  return new Intl.NumberFormat(locale.value, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(seconds)
}

watch(
  () => store.state.phase,
  async () => {
    await nextTick()
    root.value?.querySelector('h1')?.focus()
  },
)
</script>

<template>
  <div ref="root">
    <main v-if="store.state.phase === 'choosing'" class="screen">
      <h1 tabindex="-1">{{ t('session.chooseLength') }}</h1>
      <div class="lengths">
        <button
          v-for="length in SESSION_LENGTHS"
          :key="length"
          type="button"
          @click="store.start(length)"
        >
          {{ lengthName(length) }}
        </button>
      </div>
      <label class="at-once">
        <input
          type="checkbox"
          :checked="store.showAnswerAtOnce"
          @change="store.setShowAnswerAtOnce(($event.target as HTMLInputElement).checked)"
        />
        {{ t('session.showAnswerAtOnce') }}
      </label>
      <LanguageChoice />
    </main>

    <QuestionScreen v-else-if="store.state.phase === 'question'" />

    <main v-else-if="results" class="screen">
      <h1 tabindex="-1">{{ t('results.heading') }}</h1>
      <p v-if="results.percent !== null">
        {{
          t('results.accuracy', {
            percent: results.percent,
            correct: results.score.correct,
            checked: results.score.checked,
          })
        }}
      </p>
      <p>{{ t('results.questions', { count: results.score.checked }) }}</p>
      <p>{{ t('results.bestStreak', { count: results.score.bestStreak }) }}</p>
      <p v-if="results.averageSeconds !== null">
        {{ t('results.averageTime', { seconds: results.averageSeconds }) }}
      </p>
      <button type="button" class="primary" @click="store.newSession()">
        {{ t('results.newSession') }}
      </button>
    </main>
  </div>
</template>

<style scoped>
.lengths {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-s);
}

.lengths button {
  flex: 1 0 auto;
}

.at-once {
  display: flex;
  align-items: center;
  gap: var(--space-s);
  min-height: var(--target-size);
  cursor: pointer;
}

.at-once input {
  width: 1.25em;
  height: 1.25em;
  margin: 0;
  accent-color: var(--color-accent);
  cursor: pointer;
}

.at-once input:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

.primary {
  align-self: flex-start;
}
</style>
