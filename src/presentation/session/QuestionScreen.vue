<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { LETTERS } from '@/domain/pitch'
import type { Letter } from '@/domain/pitch'
import { latinSyllableName } from '@/domain/naming'
import { StaffView } from '@/infrastructure/notation'
import { useSessionStore } from './session-store'

const { t } = useI18n()
const store = useSessionStore()

const current = computed(() => store.question)

const staffFailed = ref(false)
const action = useTemplateRef('action')

const number = computed(() => {
  if (!current.value) return ''
  const { length, number } = current.value
  return length === 'unlimited'
    ? t('session.question', { number })
    : t('session.questionOf', { number, length })
})

// In the quick mode the question is replaced on answer, so its result is the previous grade.
const shownGrade = computed(() => current.value?.trainer.grade ?? current.value?.previousGrade)

const message = computed(() => {
  if (!current.value) return ''
  if (current.value.trainer.hint) return t('trainer.chooseNoteNameFirst')
  const grade = shownGrade.value
  return grade ? t(grade.correct ? 'trainer.correct' : 'trainer.incorrect') : ''
})

function pressName(letter: Letter) {
  if (store.autoNext) store.answer(letter)
  else store.select(letter)
}

// The action button is swapped in place, so without this the focus would be lost.
async function focusAction() {
  await nextTick()
  action.value?.focus()
}

async function check() {
  store.check()
  if (store.question?.trainer.grade) await focusAction()
}

async function next() {
  store.next()
  await focusAction()
}
</script>

<template>
  <main v-if="current" class="screen">
    <h1 class="visually-hidden" tabindex="-1">{{ t('trainer.heading') }}</h1>

    <div class="progress">
      <span>{{ number }}</span>
      <span>{{
        t('session.correctOf', { correct: current.score.correct, checked: current.score.checked })
      }}</span>
      <span>{{ t('session.streak', { count: current.score.streak }) }}</span>
    </div>

    <p v-if="staffFailed" class="staff-error" role="alert">{{ t('trainer.staffLoadError') }}</p>
    <template v-else>
      <StaffView
        :question="current.trainer.question"
        :label="t('trainer.staffLabel')"
        @load-error="staffFailed = true"
        @drawn="store.noteDrawn()"
      />

      <!-- No answer before the note is drawn, so loading time is never timed. Empty cells of
           the same layout keep the place of the buttons, so nothing jumps when they appear. -->
      <div data-testid="answer-controls" class="answer-controls">
        <div class="names">
          <template v-if="store.staffReady">
            <button
              v-for="letter in LETTERS"
              :key="letter"
              type="button"
              class="name"
              :aria-pressed="current.trainer.selected === letter"
              :disabled="current.trainer.grade !== null"
              @click="pressName(letter)"
            >
              {{ latinSyllableName(letter) }}
            </button>
          </template>
          <template v-else>
            <span v-for="letter in LETTERS" :key="letter" class="placeholder" />
          </template>
        </div>

        <p
          role="status"
          class="message"
          :class="{
            correct: shownGrade?.correct,
            incorrect: shownGrade?.correct === false,
          }"
        >
          <!-- A new node per question: the same text replacing itself is not announced. -->
          <span :key="current.number">{{ message }}</span>
        </p>

        <!-- The quick mode answers on a note name, so it has no action button. -->
        <template v-if="!store.autoNext">
          <button
            v-if="current.trainer.grade"
            ref="action"
            type="button"
            class="primary"
            @click="next"
          >
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
        </template>
      </div>

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

/* Only groups the controls: the screen keeps laying them out with its own gap. */
.answer-controls {
  display: contents;
}

.names {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(var(--target-size), 1fr));
  gap: var(--space-s);
}

.placeholder {
  min-height: var(--target-size);
}

/* Selection is not shown by colour alone: the button is filled and bold. */
.name[aria-pressed='true'] {
  border-color: var(--color-text);
  background: var(--color-text);
  color: var(--color-surface);
  font-weight: 700;
}

/* The selected button stays filled while disabled. */
.name:disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}

/* Reserves a line so that the action button does not jump. */
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

.finish {
  align-self: flex-start;
}

.staff-error {
  margin: 0;
}
</style>
