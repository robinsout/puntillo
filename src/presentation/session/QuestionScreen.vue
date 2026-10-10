<script setup lang="ts">
import { computed, nextTick, onMounted, ref, shallowRef, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  hasOpenNoteAfter,
  hasOpenNoteBefore,
  isNoteMarked,
  isNoteOpen,
  type NoteChoice,
} from '@/application/trainer'
import { LETTERS } from '@/domain/pitch'
import type { Alteration, Letter } from '@/domain/pitch'
import type { Duration } from '@/domain/question'
import { noteName, noteNameParts } from '@/domain/naming'
import type { WikiTopic } from '@/domain/wiki'
import { usePreferencesStore } from '@/presentation/preferences'
import { DURATION_FRACTIONS } from './duration-fractions'
import { useNoteReview } from './note-review'
import QuestionStaff, { type NoteTarget } from './QuestionStaff.vue'
import { useSessionStore } from './session-store'

const { t } = useI18n()
const store = useSessionStore()
const preferences = usePreferencesStore()

const current = computed(() => store.question)

const staffFailed = ref(false)
const action = useTemplateRef('action')
const names = useTemplateRef('names')

const nameOf = (letter: Letter, alteration?: Alteration) =>
  noteName(letter, preferences.noteNaming, preferences.seventhNote, alteration)
const nameInWords = (letter: Letter, alteration?: Alteration) => {
  const { name, word } = noteNameParts(
    letter,
    preferences.noteNaming,
    preferences.seventhNote,
    alteration,
  )
  return word ? t(word === 'sharp' ? 'trainer.sharpName' : 'trainer.flatName', { name }) : name
}
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
const several = computed(() => (trainer.value?.question.notes.length ?? 0) > 1)
const outcome = computed(() => trainer.value?.outcome ?? null)
const secondAttempt = computed(() => !!trainer.value?.firstGrade && outcome.value === null)
// The answer rows are for the current note.
const currentNote = computed(() => trainer.value?.question.notes[trainer.value.current])
const rightLetter = computed(() => currentNote.value?.pitch.letter)
const rightDuration = computed(() => currentNote.value?.duration.value)
// A part right on the first attempt stays as it is for the second one.
const currentGrade = computed(() => trainer.value?.firstGrade?.[trainer.value.current])
const pitchSettled = computed(() => currentGrade.value?.pitch === true)
const durationSettled = computed(() => currentGrade.value?.duration === true)

function captionOf(choice: NoteChoice, askDuration: boolean): string {
  if (!choice.selected) return ''
  const name = nameOf(choice.selected, choice.alteration ?? undefined)
  if (!askDuration) return name
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

const review = useNoteReview(nameInWords)
const reviewId = useId()

// Each sentence of the review is followed by its Why?, so the wording of a numbered note is split
// around its sentences.
const REVIEW_MARK = '\u0000'
const reviewNotes = computed(() => {
  if (outcome.value !== 'incorrect' || !trainer.value) return null
  let index = 0
  return review(trainer.value).map(({ number, sentences }) => {
    const [before = '', after = ''] =
      number === null
        ? []
        : t('trainer.noteReview', { number, review: REVIEW_MARK }).split(REVIEW_MARK)
    return {
      before,
      after,
      sentences: sentences.map((sentence) => {
        const each = { ...sentence, index, id: `${reviewId}-${index}` }
        index += 1
        return each
      }),
    }
  })
})

const status = useTemplateRef('status')
const whyButton = (index: number) => status.value?.querySelectorAll('button')[index]

const hint = shallowRef<{ readonly topic: WikiTopic; readonly index: number } | null>(null)

// Spec §18: the hints come with the wiki, outside the initial bundle.
const hintDialog = shallowRef<typeof import('@/presentation/wiki/HintDialog.vue').default>()

async function openHint(sentence: { readonly topic: WikiTopic; readonly index: number }) {
  hintDialog.value ??= (await import('@/presentation/wiki/HintDialog.vue')).default
  hint.value = sentence
}

// Not every engine gives the focus back to the opener when a modal dialog closes.
function closeHint() {
  const index = hint.value?.index
  hint.value = null
  if (index !== undefined) whyButton(index)?.focus()
}

function readArticle() {
  if (hint.value) store.rememberHintOpener(hint.value.index)
}

onMounted(() => {
  const opener = store.takeHintOpener()
  if (opener !== null) whyButton(opener)?.focus()
})

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
  if (current.value.trainer.hint && several.value) return t('trainer.answerEveryNote')
  if (current.value.trainer.hint)
    return t(
      current.value.trainer.askDuration
        ? 'trainer.chooseNoteNameAndDuration'
        : 'trainer.chooseNoteNameFirst',
    )
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

const hasIncorrectMark = computed(
  () =>
    LETTERS.some(nameMarks.value.isIncorrect) ||
    offeredDurations.value.some(durationMarks.value.isIncorrect),
)
const hasCorrectMark = computed(
  () =>
    LETTERS.some(nameMarks.value.isCorrect) ||
    offeredDurations.value.some(durationMarks.value.isCorrect),
)

const isDisabled = (letter: Letter) =>
  outcome.value !== null || pitchSettled.value || letter === rejectedLetter.value

const isAlterationDisabled = computed(() => outcome.value !== null || pitchSettled.value)

const isDurationDisabled = (value: Duration['value']) =>
  outcome.value !== null || durationSettled.value || value === rejectedValue.value

const isDotDisabled = computed(() => outcome.value !== null || durationSettled.value)

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

// Choosing may disable the pressed button: in the quick mode by ending the question, with several
// notes by moving on to a note whose part is settled.
async function choose(
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
  const answer = () => (store.autoNext ? store.answer(letter) : store.select(letter))
  await choose(answer, event, names.value, durations.value)
}

async function pressDuration(value: Duration['value'], event: MouseEvent) {
  const answer = () =>
    store.autoNext ? store.answerDuration({ value }) : store.selectDuration({ value })
  await choose(answer, event, durations.value, names.value)
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

        <div v-if="current.trainer.askDuration" ref="durations" class="durations">
          <template v-if="store.staffReady">
            <button
              v-for="value in current.durations"
              :key="value"
              type="button"
              class="choice"
              :class="{
                wrong: durationMarks.isIncorrect(value),
                right: durationMarks.isCorrect(value),
              }"
              :aria-pressed="current.trainer.selectedDuration?.value === value"
              :aria-describedby="durationMarks.markOf(value)"
              :disabled="isDurationDisabled(value)"
              @click="pressDuration(value, $event)"
            >
              {{ DURATION_FRACTIONS[value] }}
            </button>
            <button
              v-if="current.dots"
              type="button"
              class="choice"
              :aria-pressed="current.trainer.dot"
              :disabled="isDotDisabled"
              @click="store.toggleDot()"
            >
              {{ t('trainer.dot') }}
            </button>
          </template>
          <template v-else>
            <span v-for="value in current.durations" :key="value" class="placeholder" />
          </template>
        </div>

        <!-- Descriptions of the marked buttons: a mark must reach a screen reader, not only the eye. -->
        <span v-if="hasIncorrectMark" :id="incorrectMarkId" hidden>{{
          t('trainer.incorrect')
        }}</span>
        <span v-if="hasCorrectMark" :id="correctMarkId" hidden>{{ t('trainer.correct') }}</span>

        <!-- The Why? buttons stay next to their sentences, inside the region: a review is announced
             with them, which tells that each sentence has its explanation. -->
        <p
          ref="status"
          role="status"
          class="message"
          :class="{
            correct: correctness === true,
            incorrect: correctness === false,
          }"
        >
          <!-- A new node per question: the same text replacing itself is not announced. -->
          <span v-if="reviewNotes" :key="current.number">
            <span v-for="(note, noteIndex) in reviewNotes" :key="noteIndex">
              {{ note.before }}
              <span v-for="sentence in note.sentences" :key="sentence.id" class="sentence">
                <span :id="sentence.id">{{ sentence.text }}</span>
                {{ ' ' }}
                <button type="button" :aria-describedby="sentence.id" @click="openHint(sentence)">
                  {{ t('wiki.why') }}
                </button>
                {{ ' ' }}
              </span>
              {{ note.after }}
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

.names,
.durations {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(var(--target-size), 1fr));
  gap: var(--space-s);
}

/* Six cells share a 360 px row: side padding would push a wider fallback font's fraction past the border. */
.durations .choice {
  padding-inline: 0;
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

/* Each sentence of a review with its Why? on a line of its own, so the buttons do not break the text. */
.sentence {
  display: block;
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
