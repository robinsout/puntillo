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
import { RouterLink } from 'vue-router'
import { accuracyPercent, averageTimeMs, SESSION_LENGTHS } from '@/domain/session'
import { timerKey, useMidiInput } from '@/presentation/dependencies'
import {
  ExerciseChoice,
  LanguageChoice,
  NoteInputChoice,
  NoteNamingChoice,
  PresetChoice,
  SeventhNoteChoice,
  usePreferencesStore,
} from '@/presentation/preferences'
import MostMistakes from './MostMistakes.vue'
import QuestionScreen from './QuestionScreen.vue'
import ShortcutsButton from './ShortcutsButton.vue'
import UnfinishedSession from './UnfinishedSession.vue'
import WritingScreen from './WritingScreen.vue'
import { useLengthName } from './length-name'
import { useMidiStatus } from './midi-status'
import { useSessionStore } from './session-store'

const { t, locale } = useI18n()
const store = useSessionStore()
const preferences = usePreferencesStore()
const midiInput = useMidiInput()

// Browsers may ask the user for MIDI only within the gesture that ticks the box.
function chooseUseMidi(on: boolean) {
  preferences.chooseUseMidi(on)
  if (on) midiInput.connect()
}

// A browser without MIDI says so whether the box is ticked or not.
const midi = useMidiStatus(() => store.state.phase === 'choosing')
const midiUnsupported = computed(() => midi.status.value.kind === 'unsupported')
const midiLine = computed(() =>
  preferences.useMidi || midiUnsupported.value ? midi.line.value : null,
)
const midiLineId = useId()

const timer = inject(timerKey)
if (!timer) throw new Error('Timer is not provided: provide it with timerKey')

const root = useTemplateRef('root')

const lengthName = useLengthName()

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
      <UnfinishedSession @discarded="focusHeading" />
      <ExerciseChoice />
      <!-- A hint for Write notes only; with Read notes it is kept, not shown. -->
      <label v-if="preferences.exercise === 'write'" class="box">
        <input
          type="checkbox"
          :checked="preferences.showNoteNames"
          @change="preferences.chooseShowNoteNames(($event.target as HTMLInputElement).checked)"
        />
        {{ t('session.showNoteNames') }}
      </label>
      <PresetChoice />
      <h1 tabindex="-1">{{ t('session.chooseLength') }}</h1>
      <div class="lengths">
        <button
          v-for="length in SESSION_LENGTHS"
          :key="lengthName(length)"
          type="button"
          @click="store.start(length)"
        >
          {{ lengthName(length) }}
        </button>
      </div>
      <label class="box">
        <input
          type="checkbox"
          :checked="store.showAnswerAtOnce"
          @change="store.setShowAnswerAtOnce(($event.target as HTMLInputElement).checked)"
        />
        {{ t('session.showAnswerAtOnce') }}
      </label>
      <LanguageChoice />
      <NoteNamingChoice />
      <SeventhNoteChoice v-if="preferences.noteNaming === 'letter'" />
      <!-- For Read notes only; with Write notes it is kept, not shown. So are the sound of the keys
           and the MIDI keyboard with Note names. -->
      <template v-if="preferences.exercise === 'read'">
        <NoteInputChoice />
        <template v-if="preferences.noteInput === 'keyboard'">
          <label class="box" data-sound-switch>
            <input
              type="checkbox"
              :checked="preferences.playKeys"
              @change="preferences.choosePlayKeys(($event.target as HTMLInputElement).checked)"
            />
            {{ t('preferences.playKeys') }}
          </label>
          <label class="box">
            <input
              type="checkbox"
              :checked="preferences.useMidi"
              :disabled="midiUnsupported"
              :aria-describedby="midiLine ? midiLineId : undefined"
              @change="chooseUseMidi(($event.target as HTMLInputElement).checked)"
            />
            {{ t('preferences.useMidi') }}
          </label>
          <p v-if="midiLine" :id="midiLineId" role="status" class="notice">{{ midiLine }}</p>
          <label v-if="preferences.useMidi" class="box" data-sound-switch>
            <input
              type="checkbox"
              :checked="preferences.midiSound"
              @change="preferences.chooseMidiSound(($event.target as HTMLInputElement).checked)"
            />
            {{ t('preferences.midiSound') }}
          </label>
        </template>
      </template>
      <RouterLink to="/wiki" class="nav-link">{{ t('wiki.title') }}</RouterLink>
      <RouterLink to="/progress" class="nav-link">{{ t('progress.title') }}</RouterLink>
      <ShortcutsButton />
      <p role="status" class="notice">{{ preferences.canSave ? '' : t('preferences.notSaved') }}</p>
    </main>

    <QuestionScreen v-else-if="store.state.phase === 'question'" />
    <WritingScreen v-else-if="store.state.phase === 'writing'" />

    <main v-else-if="results" class="screen">
      <h1 tabindex="-1">{{ t('results.heading') }}</h1>
      <p v-if="results.percent !== null">
        {{
          t('results.accuracy', {
            percent: results.percent,
            points: results.score.points,
            maxPoints: results.score.maxPoints,
          })
        }}
      </p>
      <p>{{ t('results.questions', { count: results.score.checked }) }}</p>
      <p>{{ t('results.bestStreak', { count: results.score.bestStreak }) }}</p>
      <p v-if="results.averageSeconds !== null">
        {{ t('results.averageTime', { seconds: results.averageSeconds }) }}
      </p>
      <MostMistakes :mistakes="results.mostMistakes" />
      <!-- One primary action on the screen: practice when there is something to practice. -->
      <button
        v-if="results.mostMistakes.length > 0"
        type="button"
        class="primary"
        @click="store.practiceMostMistakes()"
      >
        {{ t('results.practiceOnlyThese') }}
      </button>
      <button
        type="button"
        :class="{ primary: results.mostMistakes.length === 0 }"
        @click="store.newSession()"
      >
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

.box {
  display: flex;
  align-items: center;
  gap: var(--space-s);
  min-height: var(--target-size);
  cursor: pointer;
}

.box input {
  width: 1.25em;
  height: 1.25em;
  margin: 0;
  accent-color: var(--color-accent);
  cursor: pointer;
}

.box input:focus-visible {
  outline: var(--line-thick) solid var(--color-focus);
  outline-offset: var(--line-medium);
}

.notice {
  margin: 0;
  color: var(--color-text-muted);
}

.screen > button {
  align-self: flex-start;
}
</style>
