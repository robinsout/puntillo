<script setup lang="ts">
import { computed, nextTick, ref, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  hasOpenNoteAfter,
  hasOpenNoteBefore,
  isNoteMarked,
  isNoteOpen,
  type NoteChoice,
} from '@/application/trainer'
import { keyOf, type PianoKey } from '@/domain/keyboard'
import { LETTERS } from '@/domain/pitch'
import type { Letter } from '@/domain/pitch'
import type { Duration } from '@/domain/question'
import { useKeySound } from '@/presentation/dependencies'
import { DURATION_FRACTIONS } from './duration-fractions'
import { useNoteNames } from './note-names'
import { useNoteReview } from './note-review'
import { useProgressText } from './progress'
import DurationRow from './DurationRow.vue'
import PianoKeyboard from './PianoKeyboard.vue'
import QuestionStaff, { type NoteTarget } from './QuestionStaff.vue'
import SessionStatus from './SessionStatus.vue'
import { useSessionStore } from './session-store'
import { useShortcuts } from './use-shortcuts'

const { t } = useI18n()
const store = useSessionStore()
const keySound = useKeySound()
const noteNames = useNoteNames()
const { nameOf, keyCaption, lang: namesLang } = noteNames

const current = computed(() => store.question)

const staffFailed = ref(false)
const action = useTemplateRef('action')
const names = useTemplateRef('names')
const piano = useTemplateRef('piano')

const incorrectMarkId = useId()
const correctMarkId = useId()

const number = useProgressText(current)

const trainer = computed(() => current.value?.trainer)
const several = computed(() => (trainer.value?.question.notes.length ?? 0) > 1)
const keyboard = computed(() => current.value?.noteInput === 'keyboard')
const outcome = computed(() => trainer.value?.outcome ?? null)
const secondAttempt = computed(() => !!trainer.value?.firstGrade && outcome.value === null)
// The answer rows are for the current note.
const currentNote = computed(() => trainer.value?.question.notes[trainer.value.current])
const rightLetter = computed(() => currentNote.value?.pitch.letter)
const rightKey = computed(() => currentNote.value && keyOf(currentNote.value.pitch).number)
const rightDuration = computed(() => currentNote.value?.duration.value)
// A part right on the first attempt stays as it is for the second one.
const currentGrade = computed(() => trainer.value?.firstGrade?.[trainer.value.current])
const pitchSettled = computed(() => currentGrade.value?.pitch === true)
const durationSettled = computed(() => currentGrade.value?.duration === true)

function pitchCaptionOf(choice: NoteChoice): string {
  if (choice.key) return keyCaption(choice.key)
  if (choice.selected) return nameOf(choice.selected, choice.alteration ?? undefined)
  return ''
}

function captionOf(choice: NoteChoice, askDuration: boolean): string {
  const name = pitchCaptionOf(choice)
  if (!name || !askDuration) return name
  if (!choice.selectedDuration) return ''
  const dot = choice.selectedDuration.dots ? '.' : ''
  return `${name} ${DURATION_FRACTIONS[choice.selectedDuration.value]}${dot}`
}

const noteTargets = computed((): NoteTarget[] | null => {
  const state = trainer.value
  if (!state || !several.value || !store.staffReady) return null
  return state.notes.map((choice, index) => ({
    caption: captionOf(choice, state.askDuration),
    open: isNoteOpen(state, index),
    marked: isNoteMarked(state, index),
  }))
})

const review = useNoteReview(noteNames)
const reviewed = computed(() =>
  outcome.value === 'incorrect' && trainer.value ? review(trainer.value) : null,
)

// In the quick mode a question answered right is replaced at once, so its result is shown
// as the previous outcome.
const shownOutcome = computed(() => outcome.value ?? current.value?.previousOutcome ?? null)

const correctness = computed((): boolean | undefined => {
  if (trainer.value?.hint) return undefined
  if (secondAttempt.value) return false
  return shownOutcome.value ? shownOutcome.value !== 'incorrect' : undefined
})

function hintKey(askDuration: boolean): string {
  if (keyboard.value)
    return askDuration ? 'trainer.playKeyAndChooseDuration' : 'trainer.playKeyFirst'
  return askDuration ? 'trainer.chooseNoteNameAndDuration' : 'trainer.chooseNoteNameFirst'
}

const message = computed(() => {
  if (!current.value) return ''
  if (current.value.trainer.hint && several.value) return t('trainer.answerEveryNote')
  if (current.value.trainer.hint) return t(hintKey(current.value.trainer.askDuration))
  if (secondAttempt.value) return t('trainer.incorrectTryAgain')
  if (outcome.value === 'correct') return t('trainer.correct')
  if (outcome.value === 'correct-second-try') return t('trainer.correctOnSecondTry')
  if (outcome.value === 'incorrect') return ''
  const previous = current.value.previousOutcome
  if (previous === 'correct') return t('trainer.correct')
  if (previous === 'correct-second-try') return t('trainer.correctOnSecondTry')
  if (previous === 'incorrect') return t('trainer.incorrect')
  return ''
})

// Both rows are marked alike: a choice rejected on the first attempt, or the last one if it is
// wrong, is incorrect; on the review the right choice is marked as correct unless it is marked
// incorrect. A name is right only with its alteration, which the button alone does not show.
function marksOf<T>(
  wrong: T | undefined,
  selected: T | undefined,
  right: T | undefined,
  selectedIsRight = selected === right,
) {
  const isIncorrect = (value: T) =>
    value === wrong || (outcome.value === 'incorrect' && value === selected && !selectedIsRight)
  const isCorrect = (value: T) =>
    outcome.value === 'incorrect' && value === right && !isIncorrect(value)
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

// A name rejected on the first attempt is rejected only with the alteration it was tried with.
const rejectedLetter = computed(() =>
  trainer.value?.wrongAlteration === trainer.value?.alteration
    ? (trainer.value?.wrongChoice ?? undefined)
    : undefined,
)

const nameMarks = computed(() =>
  marksOf<Letter>(
    rejectedLetter.value,
    trainer.value?.selected ?? undefined,
    rightLetter.value,
    trainer.value?.selected === rightLetter.value &&
      (trainer.value?.alteration ?? undefined) === currentNote.value?.pitch.alteration,
  ),
)

const keyMarks = computed(() =>
  marksOf<number>(trainer.value?.wrongKey?.number, trainer.value?.key?.number, rightKey.value),
)

// A rejected duration is marked only while the dot would choose it again.
const rejectedValue = computed(() => {
  const wrong = trainer.value?.wrongDuration
  if (!wrong || !!wrong.dots !== !!trainer.value?.dot) return undefined
  return wrong.value
})

const durationMarks = computed(() =>
  marksOf<Duration['value']>(
    rejectedValue.value,
    trainer.value?.selectedDuration?.value,
    rightDuration.value,
  ),
)

const offeredDurations = computed(() => current.value?.durations ?? [])

// Only the row of pitches on the screen is marked.
function hasPitchMark(mark: 'isIncorrect' | 'isCorrect'): boolean {
  if (!keyboard.value) return LETTERS.some(nameMarks.value[mark])
  return (current.value?.keys ?? []).some(({ number }) => keyMarks.value[mark](number))
}

const hasIncorrectMark = computed(
  () => hasPitchMark('isIncorrect') || offeredDurations.value.some(durationMarks.value.isIncorrect),
)
const hasCorrectMark = computed(
  () => hasPitchMark('isCorrect') || offeredDurations.value.some(durationMarks.value.isCorrect),
)

const isDisabled = (letter: Letter) =>
  outcome.value !== null || pitchSettled.value || letter === rejectedLetter.value

const isKeyDisabled = (key: PianoKey) =>
  outcome.value !== null || pitchSettled.value || key.number === trainer.value?.wrongKey?.number

const isAlterationDisabled = computed(() => outcome.value !== null || pitchSettled.value)

const isDurationDisabled = (value: Duration['value']) =>
  outcome.value !== null || durationSettled.value || value === rejectedValue.value

const isDotDisabled = computed(() => outcome.value !== null || durationSettled.value)

const durationRow = useTemplateRef('durations')
const durations = computed(() => (durationRow.value?.$el as HTMLElement | undefined) ?? null)
const pitches = computed(() =>
  keyboard.value ? ((piano.value?.$el as HTMLElement | undefined) ?? null) : names.value,
)

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

// Choosing may disable the focused button: in the quick mode by ending the question, with several
// notes by moving on to a note whose part is settled. The focus is wherever a click or a key left
// it, so it is the focused button that is looked after, not the pressed one.
async function choose(answer: () => void) {
  const focused = document.activeElement
  answer()
  if (store.question?.trainer.outcome) await focusAction()
  else if (focused instanceof HTMLButtonElement) {
    if (pitches.value?.contains(focused))
      await moveFocusOffDisabled(focused, pitches.value, durations.value)
    else if (durations.value?.contains(focused))
      await moveFocusOffDisabled(focused, durations.value, pitches.value)
  }
}

async function pressName(letter: Letter) {
  await choose(() => (store.autoNext ? store.answer(letter) : store.select(letter)))
}

async function pressKey(key: PianoKey) {
  // A test can click a disabled key; a browser cannot.
  if (!isKeyDisabled(key)) keySound.play(key)
  await choose(() => (store.autoNext ? store.answerKey(key) : store.pressKey(key)))
}

async function pressDuration(value: Duration['value']) {
  await choose(() =>
    store.autoNext ? store.answerDuration({ value }) : store.selectDuration({ value }),
  )
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

// The quick mode has no Check to take the focus after Next, so the first name, or the Tab stop of
// the keys, does.
async function next() {
  store.next()
  await nextTick()
  if (action.value) action.value.focus()
  else
    buttonsOf(pitches.value)
      .find(({ tabIndex }) => tabIndex === 0)
      ?.focus()
}

// A key does what its button does, and nothing while the button is unavailable or not there.
const showsNames = computed(() => store.staffReady && !keyboard.value)
const asksDuration = computed(() => store.staffReady && !!current.value?.trainer.askDuration)
const showsSigns = computed(() => showsNames.value && !!current.value?.sharpsAndFlats)

useShortcuts((shortcut) => {
  const state = trainer.value
  if (!state) return
  switch (shortcut.type) {
    case 'name':
      if (showsNames.value && !isDisabled(shortcut.letter)) void pressName(shortcut.letter)
      return
    case 'sharp':
      if (showsSigns.value && !isAlterationDisabled.value) store.toggleSharp()
      return
    case 'flat':
      if (showsSigns.value && !isAlterationDisabled.value) store.toggleFlat()
      return
    case 'duration':
      if (
        asksDuration.value &&
        offeredDurations.value.includes(shortcut.value) &&
        !isDurationDisabled(shortcut.value)
      )
        void pressDuration(shortcut.value)
      return
    case 'dot':
      if (asksDuration.value && current.value?.dots && !isDotDisabled.value) store.toggleDot()
      return
    case 'confirm':
      if (outcome.value) void next()
      else if (store.staffReady && !store.autoNext) void check()
      return
    case 'previous-note':
      if (noteTargets.value && hasOpenNoteBefore(state)) store.previousNote()
      return
    case 'next-note':
      if (noteTargets.value && hasOpenNoteAfter(state)) store.nextNote()
  }
})
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
      <QuestionStaff
        :question="current.trainer.question"
        :label="t('trainer.staffLabel')"
        :targets="noteTargets"
        :current="current.trainer.current"
        :caption-lang="namesLang"
        @load-error="staffFailed = true"
        @drawn="store.noteDrawn()"
        @choose="store.goToNote"
      />

      <div v-if="noteTargets" class="moves">
        <button
          type="button"
          :disabled="!hasOpenNoteBefore(current.trainer)"
          @click="store.previousNote()"
        >
          {{ t('trainer.previousNote') }}
        </button>
        <button
          type="button"
          :disabled="!hasOpenNoteAfter(current.trainer)"
          @click="store.nextNote()"
        >
          {{ t('trainer.nextNote') }}
        </button>
      </div>

      <!-- No answer before the note is drawn, so loading time is never timed. Empty cells of
           the same layout keep the place of the buttons, so nothing jumps when they appear. -->
      <div data-testid="answer-controls" class="answer-controls">
        <PianoKeyboard
          v-if="keyboard"
          ref="piano"
          :keys="current.keys"
          :ready="store.staffReady"
          :question="current.trainer.question"
          :pressed="current.trainer.key"
          :is-disabled="isKeyDisabled"
          :marks="keyMarks"
          @play="pressKey"
        />
        <div v-else ref="names" class="names">
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
              @click="pressName(letter)"
            >
              {{ nameOf(letter) }}
            </button>
            <template v-if="current.sharpsAndFlats">
              <button
                type="button"
                class="choice alteration"
                :aria-label="t('trainer.sharp')"
                :aria-pressed="current.trainer.alteration === 1"
                :disabled="isAlterationDisabled"
                @click="store.toggleSharp()"
              >
                ♯
              </button>
              <button
                type="button"
                class="choice alteration"
                :aria-label="t('trainer.flat')"
                :aria-pressed="current.trainer.alteration === -1"
                :disabled="isAlterationDisabled"
                @click="store.toggleFlat()"
              >
                ♭
              </button>
            </template>
          </template>
          <template v-else>
            <span v-for="letter in LETTERS" :key="letter" class="placeholder" />
            <template v-if="current.sharpsAndFlats">
              <span class="placeholder" />
              <span class="placeholder" />
            </template>
          </template>
        </div>

        <DurationRow
          v-if="current.trainer.askDuration"
          ref="durations"
          :durations="current.durations"
          :dots="current.dots"
          :ready="store.staffReady"
          :selected="current.trainer.selectedDuration?.value ?? null"
          :dot="current.trainer.dot"
          :is-disabled="isDurationDisabled"
          :dot-disabled="isDotDisabled"
          :marks="durationMarks"
          @choose="pressDuration"
          @dot="store.toggleDot()"
        />

        <!-- Descriptions of the marked buttons: a mark must reach a screen reader, not only the eye. -->
        <span v-if="hasIncorrectMark" :id="incorrectMarkId" hidden>{{
          t('trainer.incorrect')
        }}</span>
        <span v-if="hasCorrectMark" :id="correctMarkId" hidden>{{ t('trainer.correct') }}</span>

        <SessionStatus
          :review="reviewed"
          :message="message"
          :number="current.number"
          :correctness="correctness"
        />

        <!-- The quick mode answers on the last part chosen, so it has no Check; it stops on a review
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
.moves {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-s);
}

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

.alteration {
  font-size: 1.5em;
  line-height: 1;
}

/* The selected button stays filled while disabled. */
.choice:disabled,
.moves button:disabled {
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
