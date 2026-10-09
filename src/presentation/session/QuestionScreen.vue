<script setup lang="ts">
import { computed, nextTick, ref, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { LETTERS } from '@/domain/pitch'
import type { Letter } from '@/domain/pitch'
import { DURATION_VALUES } from '@/domain/question'
import type { Duration } from '@/domain/question'
import { noteName } from '@/domain/naming'
import { staffPosition } from '@/domain/staff'
import type { StaffPosition } from '@/domain/staff'
import { StaffView } from '@/infrastructure/notation'
import { usePreferencesStore } from '@/presentation/preferences'
import DurationImage from './DurationImage.vue'
import { useSessionStore } from './session-store'

const { t } = useI18n()
const store = useSessionStore()
const preferences = usePreferencesStore()

const current = computed(() => store.question)

const staffFailed = ref(false)
const action = useTemplateRef('action')
const names = useTemplateRef('names')

const nameOf = (letter: Letter) => noteName(letter, preferences.noteNaming, preferences.seventhNote)
// Screen readers pronounce the Cyrillic names in Russian whatever the interface language.
const namesLang = computed(() =>
  preferences.noteNaming === 'cyrillic-syllable' ? 'ru' : undefined,
)

const incorrectMarkId = useId()
const correctMarkId = useId()

const number = computed(() => {
  if (!current.value) return ''
  const { length, number } = current.value
  return length === 'unlimited'
    ? t('session.question', { number })
    : t('session.questionOf', { number, length })
})

const trainer = computed(() => current.value?.trainer)
const outcome = computed(() => trainer.value?.outcome ?? null)
const secondAttempt = computed(() => !!trainer.value?.firstGrade && outcome.value === null)
const rightLetter = computed(() => trainer.value?.question.note.pitch.letter)
const rightDuration = computed(() => trainer.value?.question.note.duration.value)
// A part right on the first attempt stays as it is for the second one.
const pitchSettled = computed(() => trainer.value?.firstGrade?.pitch === true)
const durationSettled = computed(() => trainer.value?.firstGrade?.duration === true)

function placeKey(position: StaffPosition): string {
  switch (position.kind) {
    case 'ledger-line-below':
      return `trainer.place.ledgerLineBelow${position.number}`
    case 'below-staff':
      return 'trainer.place.belowStaff'
    case 'line':
      return `trainer.place.line${position.number}`
    case 'space':
      return `trainer.place.space${position.number}`
  }
}

// One sentence for each part wrong in the last attempt, the name first.
function review(): string {
  const state = trainer.value
  if (!state) return ''
  const { question, selected, selectedDuration } = state
  const { pitch, duration } = question.note
  const sentences: string[] = []
  if (selected && selected !== pitch.letter)
    sentences.push(
      t('trainer.review', {
        chosen: nameOf(selected),
        expected: nameOf(pitch.letter),
        place: t(placeKey(staffPosition(pitch, question.clef))),
      }),
    )
  if (selectedDuration && selectedDuration.value !== duration.value)
    sentences.push(
      t('trainer.durationReview', {
        chosen: t(`trainer.chosenDuration.${selectedDuration.value}`),
        expected: t(`trainer.expectedDuration.${duration.value}`),
      }),
    )
  return sentences.join(' ')
}

// In the quick mode a question answered right is replaced at once, so its result is shown
// as the previous outcome.
const shownOutcome = computed(() => outcome.value ?? current.value?.previousOutcome ?? null)

const correctness = computed((): boolean | undefined => {
  if (trainer.value?.hint) return undefined
  if (secondAttempt.value) return false
  return shownOutcome.value ? shownOutcome.value !== 'incorrect' : undefined
})

const message = computed(() => {
  if (!current.value) return ''
  if (current.value.trainer.hint) return t('trainer.chooseNoteNameAndDuration')
  if (secondAttempt.value) return t('trainer.incorrectTryAgain')
  if (outcome.value === 'correct') return t('trainer.correct')
  if (outcome.value === 'correct-second-try') return t('trainer.correctOnSecondTry')
  if (outcome.value === 'incorrect') return review()
  const previous = current.value.previousOutcome
  if (previous === 'correct') return t('trainer.correct')
  if (previous === 'correct-second-try') return t('trainer.correctOnSecondTry')
  if (previous === 'incorrect') return t('trainer.incorrect')
  return ''
})

// Both rows are marked alike: a choice rejected on the first attempt, or the last one if it is
// wrong, is incorrect; on the review the right choice is marked as correct.
function marksOf<T>(wrong: T | undefined, selected: T | undefined, right: T | undefined) {
  const isIncorrect = (value: T) =>
    value === wrong || (outcome.value === 'incorrect' && value === selected && value !== right)
  const isCorrect = (value: T) => outcome.value === 'incorrect' && value === right
  return {
    isIncorrect,
    isCorrect,
    markOf: (value: T) => {
      if (isIncorrect(value)) return incorrectMarkId
      if (isCorrect(value)) return correctMarkId
      return undefined
    },
  }
}

const nameMarks = computed(() =>
  marksOf<Letter>(
    trainer.value?.wrongChoice ?? undefined,
    trainer.value?.selected ?? undefined,
    rightLetter.value,
  ),
)

const durationMarks = computed(() =>
  marksOf<Duration['value']>(
    trainer.value?.wrongDuration?.value,
    trainer.value?.selectedDuration?.value,
    rightDuration.value,
  ),
)

const hasIncorrectMark = computed(
  () =>
    LETTERS.some(nameMarks.value.isIncorrect) ||
    DURATION_VALUES.some(durationMarks.value.isIncorrect),
)
const hasCorrectMark = computed(
  () =>
    LETTERS.some(nameMarks.value.isCorrect) || DURATION_VALUES.some(durationMarks.value.isCorrect),
)

const isDisabled = (letter: Letter) =>
  outcome.value !== null || pitchSettled.value || letter === trainer.value?.wrongChoice

const isDurationDisabled = (value: Duration['value']) =>
  outcome.value !== null || durationSettled.value || value === trainer.value?.wrongDuration?.value

const durations = useTemplateRef('durations')

const buttonsOf = (row: HTMLElement | null) => Array.from(row?.querySelectorAll('button') ?? [])
const isEnabled = (button: HTMLButtonElement) => !button.disabled

// A disabled button drops the focus, so it goes to the nearest enabled neighbour, the right one
// first; when the whole row is settled, to the row still to answer.
async function moveFocusOffDisabled(
  pressed: HTMLButtonElement,
  row: HTMLElement | null,
  otherRow: HTMLElement | null,
) {
  await nextTick()
  if (isEnabled(pressed)) return
  const buttons = buttonsOf(row)
  const index = buttons.indexOf(pressed)
  const target =
    buttons.slice(index + 1).find(isEnabled) ??
    buttons.slice(0, index).reverse().find(isEnabled) ??
    buttonsOf(otherRow).find(isEnabled)
  target?.focus()
}

async function answerQuick(
  answer: () => void,
  event: MouseEvent,
  row: HTMLElement | null,
  otherRow: HTMLElement | null,
) {
  const pressed = event.currentTarget as HTMLButtonElement
  const hadFocus = document.activeElement === pressed
  answer()
  if (store.question?.trainer.outcome) await focusAction()
  else if (hadFocus) await moveFocusOffDisabled(pressed, row, otherRow)
}

async function pressName(letter: Letter, event: MouseEvent) {
  if (store.autoNext)
    await answerQuick(() => store.answer(letter), event, names.value, durations.value)
  else store.select(letter)
}

async function pressDuration(value: Duration['value'], event: MouseEvent) {
  if (store.autoNext)
    await answerQuick(() => store.answerDuration({ value }), event, durations.value, names.value)
  else store.selectDuration({ value })
}

// The action button is swapped in place, so without this the focus would be lost.
async function focusAction() {
  await nextTick()
  action.value?.focus()
}

async function check() {
  store.check()
  if (store.question?.trainer.outcome) await focusAction()
}

// The quick mode has no Check to take the focus after Next, so the first name does.
async function next() {
  store.next()
  await nextTick()
  if (action.value) action.value.focus()
  else buttonsOf(names.value)[0]?.focus()
}
</script>

<template>
  <main v-if="current" class="screen">
    <h1 class="visually-hidden" tabindex="-1">{{ t('trainer.heading') }}</h1>

    <div class="progress">
      <span>{{ number }}</span>
      <span>{{
        t('session.pointsOf', { points: current.score.points, maxPoints: current.score.maxPoints })
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
        <div ref="names" class="names">
          <template v-if="store.staffReady">
            <button
              v-for="letter in LETTERS"
              :key="letter"
              type="button"
              class="choice"
              :class="{ wrong: nameMarks.isIncorrect(letter), right: nameMarks.isCorrect(letter) }"
              :aria-pressed="current.trainer.selected === letter"
              :aria-describedby="nameMarks.markOf(letter)"
              :disabled="isDisabled(letter)"
              :lang="namesLang"
              @click="pressName(letter, $event)"
            >
              {{ nameOf(letter) }}
            </button>
          </template>
          <template v-else>
            <span v-for="letter in LETTERS" :key="letter" class="placeholder" />
          </template>
        </div>

        <div ref="durations" class="durations">
          <template v-if="store.staffReady">
            <button
              v-for="value in DURATION_VALUES"
              :key="value"
              type="button"
              class="choice"
              :class="{
                wrong: durationMarks.isIncorrect(value),
                right: durationMarks.isCorrect(value),
              }"
              :aria-label="t(`trainer.duration.${value}`)"
              :aria-pressed="current.trainer.selectedDuration?.value === value"
              :aria-describedby="durationMarks.markOf(value)"
              :disabled="isDurationDisabled(value)"
              @click="pressDuration(value, $event)"
            >
              <DurationImage :value="value" />
            </button>
          </template>
          <template v-else>
            <span v-for="value in DURATION_VALUES" :key="value" class="placeholder" />
          </template>
        </div>

        <!-- Descriptions of the marked buttons: a mark must reach a screen reader, not only the eye. -->
        <span v-if="hasIncorrectMark" :id="incorrectMarkId" hidden>{{
          t('trainer.incorrect')
        }}</span>
        <span v-if="hasCorrectMark" :id="correctMarkId" hidden>{{ t('trainer.correct') }}</span>

        <p
          role="status"
          class="message"
          :class="{
            correct: correctness === true,
            incorrect: correctness === false,
          }"
        >
          <!-- A new node per question: the same text replacing itself is not announced. -->
          <span :key="current.number">{{ message }}</span>
        </p>

        <!-- The quick mode answers on a name and a duration, so it has no Check; it stops on a review
             only, which Next leaves once it is read. -->
        <button v-if="outcome" ref="action" type="button" class="primary" @click="next">
          {{ current.isLast ? t('session.toResults') : t('trainer.next') }}
        </button>
        <template v-else-if="!store.autoNext">
          <button v-if="store.staffReady" ref="action" type="button" class="primary" @click="check">
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

.durations {
  display: grid;
  grid-template-columns: repeat(4, minmax(var(--target-size), 1fr));
  gap: var(--space-s);
}

.placeholder {
  min-height: var(--target-size);
}

/* Selection is not shown by colour alone: the button is filled and bold. */
.choice[aria-pressed='true'] {
  border-color: var(--color-text);
  background: var(--color-text);
  color: var(--color-surface);
  font-weight: 700;
}

/* The selected button stays filled while disabled. */
.choice:disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}

/* Marks rest on shape, not only on colour: a wrong choice is in a dashed frame, a wrong name also struck out. */
.choice.wrong {
  border-style: dashed;
  border-color: var(--color-danger);
  text-decoration: line-through;
}

/* The right choice gets a double-width frame and stays at full strength among disabled ones. */
.choice.right:disabled {
  border-color: var(--color-success);
  box-shadow: inset 0 0 0 2px var(--color-success);
  opacity: 1;
  font-weight: 700;
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
