<script setup lang="ts">
import { computed, nextTick, ref, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { isNoteMarked } from '@/application/trainer'
import type { Pitch } from '@/domain/pitch'
import { noteName } from '@/domain/naming'
import { staffPosition, stepFromBottomLine } from '@/domain/staff'
import { usePreferencesStore } from '@/presentation/preferences'
import { placeKey } from './note-review'
import { useReviewHints } from './review-hints'
import { useSessionStore } from './session-store'
import WritingStaff, { type NoteColumn } from './WritingStaff.vue'

const { t } = useI18n()
const store = useSessionStore()
const preferences = usePreferencesStore()

const current = computed(() => store.writing)
const writing = computed(() => current.value?.writing)
const outcome = computed(() => writing.value?.outcome ?? null)
const secondAttempt = computed(() => !!writing.value?.firstGrade && outcome.value === null)

const staffFailed = ref(false)
const action = useTemplateRef('action')

// Criterion 4: the scientific octave number in every naming, "sol4", "G4".
const nameOf = ({ letter, alteration, octave }: Pitch) =>
  `${noteName(letter, preferences.noteNaming, preferences.seventhNote, alteration)}${octave}`
// Screen readers pronounce the Cyrillic names in Russian whatever the interface language.
const namesLang = computed(() =>
  preferences.noteNaming === 'cyrillic-syllable' ? 'ru' : undefined,
)

const number = computed(() => {
  if (!current.value) return ''
  const { length, number } = current.value
  return length === 'unlimited'
    ? t('session.question', { number })
    : t('session.questionOf', { number, length })
})

// The right note is drawn once the question is over with a wrong one.
const drawnNotes = computed((): (Pitch | null)[] => {
  const state = writing.value
  if (!state) return []
  if (outcome.value === 'incorrect') return state.question.notes.map(({ pitch }) => pitch)
  return [state.placed]
})

const columns = computed((): NoteColumn[] => {
  const state = writing.value
  if (!state) return []
  const { placed, question } = state
  return question.notes.map((_, index) => ({
    valueText: placed ? nameOf(placed) : t('writing.noNote'),
    step: placed && stepFromBottomLine(placed, question.clef),
    marked: isNoteMarked(state, index),
  }))
})

const reviewId = useId()
const reviewSentences = computed(() => {
  const state = writing.value
  if (outcome.value !== 'incorrect' || !state?.placed) return null
  const written = state.placed
  return state.question.notes.map(({ pitch }, index) => ({
    id: `${reviewId}-${index}`,
    index,
    text: t('writing.review', {
      written: nameOf(written),
      expected: nameOf(pitch),
      place: t(placeKey(staffPosition(pitch, state.question.clef))),
    }),
    topic: 'treble-staff' as const,
  }))
})

const { hint, hintDialog, openHint, closeHint, readArticle } = useReviewHints(
  useTemplateRef('status'),
)

// In the quick mode a question checked right is replaced at once, so its result is shown as the
// previous outcome.
const shownOutcome = computed(() => outcome.value ?? current.value?.previousOutcome ?? null)

const correctness = computed((): boolean | undefined => {
  if (writing.value?.hint) return undefined
  if (secondAttempt.value) return false
  return shownOutcome.value ? shownOutcome.value !== 'incorrect' : undefined
})

const OUTCOME_KEYS = {
  correct: 'trainer.correct',
  'correct-second-try': 'trainer.correctOnSecondTry',
  incorrect: 'trainer.incorrect',
} as const

const message = computed(() => {
  const state = writing.value
  if (!state) return ''
  if (state.hint === 'place-note') return t('writing.placeNoteFirst')
  if (state.hint === 'move-note') return t('writing.moveNoteFirst')
  if (secondAttempt.value) return t('trainer.incorrectTryAgain')
  if (outcome.value === 'incorrect') return ''
  return shownOutcome.value ? t(OUTCOME_KEYS[shownOutcome.value]) : ''
})

// The action button is swapped in place, so without this the focus would be lost.
async function focusAction() {
  await nextTick()
  action.value?.focus()
}

async function check() {
  store.check()
  if (store.writing?.writing.outcome) await focusAction()
}

async function next() {
  store.next()
  await focusAction()
}
</script>

<template>
  <main v-if="current && writing" class="screen">
    <div class="progress">
      <span>{{ number }}</span>
      <span>{{
        t('session.pointsOf', { points: current.score.points, maxPoints: current.score.maxPoints })
      }}</span>
      <span>{{ t('session.streak', { count: current.score.streak }) }}</span>
    </div>

    <h1 tabindex="-1">{{ t('writing.heading') }}</h1>
    <ol class="task" :lang="namesLang">
      <!-- Slice 1 asks for one note, which is always the current one. -->
      <li
        v-for="(note, index) in writing.question.notes"
        :key="index"
        :class="{ current: index === 0 }"
      >
        {{ nameOf(note.pitch) }}
      </li>
    </ol>

    <p v-if="staffFailed" class="staff-error" role="alert">{{ t('trainer.staffLoadError') }}</p>
    <template v-else>
      <WritingStaff
        :question="writing.question"
        :label="t('trainer.staffLabel')"
        :written="drawnNotes"
        :columns="columns"
        :current="0"
        @load-error="staffFailed = true"
        @drawn="store.noteDrawn()"
        @place="store.place"
        @step-up="store.stepUp()"
        @step-down="store.stepDown()"
        @check="check"
      />

      <!-- No answer before the staff is drawn, so loading time is never timed. Empty cells keep
           the place of the buttons, so nothing jumps when they appear. -->
      <div class="steps">
        <template v-if="store.staffReady">
          <button
            type="button"
            :aria-label="t('writing.stepUp')"
            :disabled="!writing.canStepUp"
            @click="store.stepUp()"
          >
            ▲
          </button>
          <button
            type="button"
            :aria-label="t('writing.stepDown')"
            :disabled="!writing.canStepDown"
            @click="store.stepDown()"
          >
            ▼
          </button>
        </template>
        <template v-else>
          <span class="placeholder" />
          <span class="placeholder" />
        </template>
      </div>

      <p
        ref="status"
        role="status"
        class="message"
        :class="{ correct: correctness === true, incorrect: correctness === false }"
      >
        <!-- A new node per question: the same text replacing itself is not announced. -->
        <span v-if="reviewSentences" :key="current.number">
          <span v-for="sentence in reviewSentences" :key="sentence.id" class="sentence">
            <span :id="sentence.id">{{ sentence.text }}</span>
            {{ ' ' }}
            <button type="button" :aria-describedby="sentence.id" @click="openHint(sentence)">
              {{ t('wiki.why') }}
            </button>
          </span>
        </span>
        <span v-else :key="current.number">{{ message }}</span>
      </p>
      <component
        :is="hintDialog"
        v-if="hint && hintDialog"
        :topic="hint.topic"
        @close="closeHint"
        @read="readArticle"
      />

      <!-- Writing is checked with Check in the quick mode too. -->
      <button v-if="outcome" ref="action" type="button" class="primary" @click="next">
        {{ current.isLast ? t('session.toResults') : t('trainer.next') }}
      </button>
      <button
        v-else-if="store.staffReady"
        ref="action"
        type="button"
        class="primary"
        @click="check"
      >
        {{ t('trainer.check') }}
      </button>
      <span v-else class="placeholder" />

      <label class="auto-next">
        <input
          type="checkbox"
          :checked="store.autoNext"
          @change="store.setAutoNext(($event.target as HTMLInputElement).checked)"
        />
        {{ t('trainer.openNextAutomatically') }}
      </label>
    </template>

    <!-- Outside the staff branch: the session can be finished even if the staff fails. -->
    <button type="button" class="finish" @click="store.finish()">
      {{ t('session.finish') }}
    </button>
  </main>
</template>

<style scoped>
.progress {
  display: flex;
  flex-wrap: wrap;
  column-gap: var(--space-m);
}

.task {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-s);
  margin: 0;
  padding: 0;
  list-style: none;
}

.task .current {
  font-weight: 700;
}

.steps {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-s);
}

.steps button:disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}

.placeholder {
  min-height: var(--target-size);
}

.sentence {
  display: block;
}

.message {
  min-height: 1lh;
  margin: 0;
}

.correct {
  color: var(--color-success);
}

.incorrect {
  color: var(--color-danger);
}

.primary,
.finish {
  align-self: flex-start;
}

.auto-next {
  display: flex;
  align-items: center;
  gap: var(--space-s);
  min-height: var(--target-size);
  cursor: pointer;
}

.auto-next input {
  width: 1.25em;
  height: 1.25em;
  margin: 0;
  accent-color: var(--color-accent);
  cursor: pointer;
}

.auto-next input:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

.staff-error {
  margin: 0;
}
</style>
