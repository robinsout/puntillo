<script setup lang="ts">
import {
  computed,
  inject,
  nextTick,
  onBeforeUnmount,
  onMounted,
  useId,
  useTemplateRef,
  watch,
} from 'vue'
import { useI18n } from 'vue-i18n'
import {
  accuracyPercent,
  averageTimeMs,
  SESSION_LENGTHS,
  type SessionLength,
} from '@/domain/session'
import { timerKey } from '@/presentation/dependencies'
import {
  ExerciseChoice,
  PresetChoice,
  StorageNotice,
  usePreferencesStore,
} from '@/presentation/preferences'
import { UiButton, UiOptionGrid, UiStat } from '@/presentation/ui'
import MostMistakes from './MostMistakes.vue'
import QuestionScreen from './QuestionScreen.vue'
import UnfinishedSession from './UnfinishedSession.vue'
import WritingScreen from './WritingScreen.vue'
import { useLengthName } from './length-name'
import { useSessionStore } from './session-store'

const { t, locale } = useI18n()
const store = useSessionStore()

const timer = inject(timerKey)
if (!timer) throw new Error('Timer is not provided: provide it with timerKey')

const root = useTemplateRef('root')

const preferences = usePreferencesStore()
const lengthName = useLengthName()
const lengthGroup = useId()

// The screen shows No limit after the counted lengths, not last as the domain lists it.
const LENGTH_ORDER: readonly SessionLength[] = [
  ...SESSION_LENGTHS.filter((length) => typeof length === 'number'),
  ...SESSION_LENGTHS.filter((length) => length === 'unlimited'),
  ...SESSION_LENGTHS.filter((length) => typeof length === 'object'),
]

const lengthOptions = computed(() =>
  LENGTH_ORDER.map((length) => ({
    value: length,
    label: lengthName(length),
    display: length === 'unlimited' ? '∞' : undefined,
  })),
)

const sessionLength = computed({
  get: () => preferences.sessionLength,
  set: (chosen: SessionLength) => preferences.chooseSessionLength(chosen),
})

const SECOND = 1000

// The time shown and the end of a session on time change with nothing done on the page.
watch(
  () => store.timed,
  (timed, _, onCleanup) => {
    if (timed) onCleanup(timer.every(SECOND, store.refresh))
  },
  { immediate: true },
)

const results = computed(() => {
  const { state } = store
  if (state.phase !== 'results') return null
  const averageMs = averageTimeMs(state.score)
  return {
    score: state.score,
    mostMistakes: state.mostMistakes,
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

async function focusHeading() {
  await nextTick()
  root.value?.querySelector('h1')?.focus()
}

watch(() => store.state.phase, focusHeading)
// Opened by the navigation, the choice screen is new as after a change of phase. The question and
// the results come back from the wiki with the focus on what was followed there.
onMounted(() => {
  if (store.state.phase === 'choosing') focusHeading()
})

// The session is saved as the page goes away, so that the time passed is right after a reload.
const saveOnHide = () => {
  if (document.visibilityState === 'hidden') store.saveProgress()
}
onMounted(() => {
  store.refresh()
  window.addEventListener('pagehide', store.saveProgress)
  document.addEventListener('visibilitychange', saveOnHide)
})
onBeforeUnmount(() => {
  window.removeEventListener('pagehide', store.saveProgress)
  document.removeEventListener('visibilitychange', saveOnHide)
})
</script>

<template>
  <div ref="root">
    <main v-if="store.state.phase === 'choosing'" class="screen">
      <h1 tabindex="-1" class="visually-hidden">{{ t('wiki.trainer') }}</h1>
      <UnfinishedSession @discarded="focusHeading" />
      <ExerciseChoice />
      <PresetChoice />
      <h2>{{ t('session.chooseLength') }}</h2>
      <UiOptionGrid
        v-model="sessionLength"
        :label="t('session.chooseLength')"
        label-hidden
        :name="lengthGroup"
        :options="lengthOptions"
      />
      <UiButton variant="primary" size="l" block @click="store.start(preferences.sessionLength)">
        {{ t('session.start') }}
      </UiButton>
      <StorageNotice />
    </main>

    <QuestionScreen v-else-if="store.state.phase === 'question'" />
    <WritingScreen v-else-if="store.state.phase === 'writing'" />

    <main v-else-if="results" class="screen">
      <h1 tabindex="-1">{{ t('results.heading') }}</h1>
      <p v-if="results.percent !== null" class="accuracy">
        <span class="percent">{{ t('results.accuracy', { percent: results.percent }) }}</span>
        <span class="points">
          {{
            t(
              'results.points',
              { points: results.score.points, maxPoints: results.score.maxPoints },
              results.score.maxPoints,
            )
          }}
        </span>
      </p>
      <dl class="stats">
        <UiStat :label="t('results.questions')" :value="results.score.checked" />
        <UiStat :label="t('results.bestStreak')" :value="results.score.bestStreak" />
        <UiStat
          v-if="results.averageSeconds !== null"
          :label="t('results.averageTime')"
          :value="t('results.seconds', { seconds: results.averageSeconds })"
        />
      </dl>
      <MostMistakes :mistakes="results.mostMistakes" />
      <!-- One primary action on the screen: practice when there is something to practice. -->
      <div class="actions">
        <UiButton
          v-if="results.mostMistakes.length > 0"
          variant="primary"
          size="l"
          block
          @click="store.practiceMostMistakes()"
        >
          {{ t('results.practiceOnlyThese') }}
        </UiButton>
        <UiButton
          :variant="results.mostMistakes.length > 0 ? 'secondary' : 'primary'"
          :size="results.mostMistakes.length > 0 ? 'm' : 'l'"
          block
          @click="store.newSession()"
        >
          {{ t('results.newSession') }}
        </UiButton>
      </div>
    </main>
  </div>
</template>

<style scoped>
h2 {
  margin: 0;
}

.accuracy {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: var(--space-s);
}

.percent {
  font-family: var(--font-display);
  font-size: var(--font-size-display);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-tight);
}

.points {
  color: var(--color-text-soft);
}

/* Three tiles in a row even on a phone: their labels wrap rather than push the row wider. */
.stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-s);
  margin: 0;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
}
</style>
