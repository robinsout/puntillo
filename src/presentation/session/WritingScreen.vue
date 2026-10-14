<script setup lang="ts">
import { computed, nextTick, ref, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { hasOpenNoteAfter, hasOpenNoteBefore, isNoteMarked } from '@/application/trainer'
import type { Pitch } from '@/domain/pitch'
import { noteName } from '@/domain/naming'
import { isSameDuration, type Accidental, type Duration, type WrittenNote } from '@/domain/question'
import { stepFromBottomLine } from '@/domain/staff'
import { usePreferencesStore } from '@/presentation/preferences'
import DurationRow, { type DurationMarks } from './DurationRow.vue'
import { soundingSign, useWritingReview, type Spell } from './note-review'
import { useProgressText } from './progress'
import { useSessionStore } from './session-store'
import SessionStatus from './SessionStatus.vue'
import { useShortcuts } from './use-shortcuts'
import WritingStaff, { type NoteColumn } from './WritingStaff.vue'

const { t } = useI18n()
const store = useSessionStore()
const preferences = usePreferencesStore()

const current = computed(() => store.writing)
const writing = computed(() => current.value?.writing)
const outcome = computed(() => writing.value?.outcome ?? null)
const secondAttempt = computed(() => !!writing.value?.firstGrade && outcome.value === null)
const several = computed(() => (writing.value?.question.notes.length ?? 0) > 1)

const staffFailed = ref(false)
const action = useTemplateRef('action')

const SIGN_ALTERATION = { sharp: 1, flat: -1, natural: undefined } as const

// A note as written, its own sign before the octave, a natural included: "fa♮4".
const spell: Spell = (letter, sign) => {
  const name = noteName(
    letter,
    preferences.noteNaming,
    preferences.seventhNote,
    sign && SIGN_ALTERATION[sign],
  )
  return sign === 'natural' ? `${name}♮` : name
}
// Criterion 4: a note as it sounds, with the scientific octave number in every naming: "sol4",
// "fa♯4", "G4".
const nameOf = ({ letter, alteration, octave }: Pitch) =>
  `${spell(letter, soundingSign(alteration))}${octave}`
const writtenName = ({ letter, octave }: Pitch, sign: Accidental | null) =>
  `${spell(letter, sign ?? undefined)}${octave}`
// Screen readers pronounce the Cyrillic names in Russian whatever the interface language.
const namesLang = computed(() =>
  preferences.noteNaming === 'cyrillic-syllable' ? 'ru' : undefined,
)

const number = useProgressText(current)

const durationInTask = ({ value, dots }: Duration) =>
  t(`writing.${dots ? 'taskDottedDuration' : 'taskDuration'}.${value}`)

// "sol4, quarter note; …": each note with its duration when the duration is asked.
const task = computed(() => {
  const state = writing.value
  if (!state) return []
  const last = state.question.notes.length - 1
  return state.question.notes.map(({ pitch, duration }, index) => {
    const name = state.askDuration ? `${nameOf(pitch)}, ${durationInTask(duration)}` : nameOf(pitch)
    return index < last ? `${name}; ` : name
  })
})

// The right notes are drawn once the question is over with a wrong one. Until its duration is
// chosen, a written note is a bare head.
const drawnNotes = computed((): (WrittenNote | null)[] => {
  const state = writing.value
  if (!state) return []
  return state.question.notes.map(({ pitch, duration }, index) => {
    const { placed, accidental, selectedDuration } = state.notes[index] ?? {}
    if (outcome.value === 'incorrect') {
      const sign = state.question.notes[index]?.accidental
      return {
        pitch: { letter: pitch.letter, octave: pitch.octave },
        duration,
        ...(sign && { accidental: sign }),
      }
    }
    if (!placed) return null
    return {
      pitch: placed,
      duration: state.askDuration ? (selectedDuration ?? null) : duration,
      ...(accidental && { accidental }),
    }
  })
})

const columns = computed((): NoteColumn[] => {
  const state = writing.value
  if (!state) return []
  return state.notes.map(({ placed, accidental }, index) => ({
    valueText: placed ? writtenName(placed, accidental) : t('writing.noNote'),
    step: placed && stepFromBottomLine(placed, state.question.clef),
    marked: isNoteMarked(state, index),
    caption: preferences.showNoteNames && placed ? writtenName(placed, accidental) : '',
    captionLang: namesLang.value,
  }))
})

// The duration row is for the current note; a duration right on the first attempt stays.
const currentNote = computed(() => writing.value?.question.notes[writing.value.current])
const durationSettled = computed(
  () => writing.value?.firstGrade?.[writing.value.current]?.duration === true,
)

// A rejected duration is marked only while the dot would choose it again.
const rejectedValue = computed(() => {
  const wrong = writing.value?.wrongDuration
  if (!wrong || !!wrong.dots !== !!writing.value?.dot) return undefined
  return wrong.value
})

const incorrectMarkId = useId()
const correctMarkId = useId()

// As in Read notes: the rejected duration, or on the review a wrong one, is incorrect; on the
// review the right one is correct.
const durationMarks = computed((): DurationMarks => {
  const selected = writing.value?.selectedDuration
  const right = currentNote.value?.duration
  const selectedIsWrong = !!selected && !!right && !isSameDuration(selected, right)
  const isIncorrect = (value: Duration['value']) =>
    value === rejectedValue.value ||
    (outcome.value === 'incorrect' && selectedIsWrong && value === selected?.value)
  const isCorrect = (value: Duration['value']) =>
    outcome.value === 'incorrect' && value === right?.value && !isIncorrect(value)
  return {
    isIncorrect,
    isCorrect,
    markOf: (value) => {
      if (isIncorrect(value)) return incorrectMarkId
      if (isCorrect(value)) return correctMarkId
      return undefined
    },
  }
})

const offeredDurations = computed(() => current.value?.durations ?? [])
const hasIncorrectMark = computed(() =>
  offeredDurations.value.some(durationMarks.value.isIncorrect),
)
const hasCorrectMark = computed(() => offeredDurations.value.some(durationMarks.value.isCorrect))

const isDurationDisabled = (value: Duration['value']) =>
  outcome.value !== null || durationSettled.value || value === rejectedValue.value
const isDotDisabled = computed(() => outcome.value !== null || durationSettled.value)

// A step and its sign right on the first attempt stay as they are.
const pitchSettled = computed(
  () => writing.value?.firstGrade?.[writing.value.current]?.pitch === true,
)
const signsDisabled = computed(() => outcome.value !== null || pitchSettled.value)

const SIGNS = [
  { sign: 'sharp', symbol: '♯', name: 'trainer.sharp', toggle: () => store.toggleSharp() },
  { sign: 'flat', symbol: '♭', name: 'trainer.flat', toggle: () => store.toggleFlat() },
  { sign: 'natural', symbol: '♮', name: 'writing.natural', toggle: () => store.toggleNatural() },
] as const

const review = useWritingReview(spell)
const reviewed = computed(() =>
  outcome.value === 'incorrect' && writing.value ? review(writing.value) : null,
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

// As in Read notes, several notes are asked for at once, one note by what it misses.
const HINT_KEYS = {
  'place-note': 'writing.placeNoteFirst',
  'choose-duration': 'writing.chooseDurationFirst',
  'move-note': 'writing.changeNoteFirst',
} as const

const message = computed(() => {
  const state = writing.value
  if (!state) return ''
  if (state.hint === 'move-note' || (state.hint && !several.value)) return t(HINT_KEYS[state.hint])
  if (state.hint) return t('trainer.answerEveryNote')
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

// A key does what its button does, and nothing while the button is unavailable or not there. The
// letters name notes in Read notes and are left to the browser here.
const signsShown = computed(() => store.staffReady && !!current.value?.signs)
const durationsShown = computed(() => store.staffReady && !!writing.value?.askDuration)

function toggleSign(sign: Accidental) {
  if (signsShown.value && !signsDisabled.value) SIGNS.find((each) => each.sign === sign)?.toggle()
}

useShortcuts((shortcut) => {
  const state = writing.value
  switch (shortcut.type) {
    case 'step-up':
      if (store.staffReady && state?.canStepUp) store.stepUp()
      return true
    case 'step-down':
      if (store.staffReady && state?.canStepDown) store.stepDown()
      return true
    case 'sharp':
    case 'flat':
    case 'natural':
      toggleSign(shortcut.type)
      return true
    case 'duration':
      if (
        durationsShown.value &&
        offeredDurations.value.includes(shortcut.value) &&
        !isDurationDisabled(shortcut.value)
      )
        store.selectDuration({ value: shortcut.value })
      return true
    case 'dot':
      if (durationsShown.value && current.value?.dots && !isDotDisabled.value) store.toggleDot()
      return true
    case 'confirm':
      if (outcome.value) void next()
      else if (store.staffReady) void check()
      return true
    case 'previous-note':
      if (state && several.value && hasOpenNoteBefore(state)) store.previousNote()
      return true
    case 'next-note':
      if (state && several.value && hasOpenNoteAfter(state)) store.nextNote()
      return true
    case 'name':
    case 'black':
    case 'octave-down':
    case 'octave-up':
      return false
  }
})
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
      <li
        v-for="(text, index) in task"
        :key="index"
        :class="{ current: index === writing.current }"
        :aria-current="index === writing.current ? 'true' : undefined"
      >
        {{ text }}
      </li>
    </ol>

    <p v-if="staffFailed" class="staff-error" role="alert">{{ t('trainer.staffLoadError') }}</p>
    <template v-else>
      <WritingStaff
        :question="writing.question"
        :label="t('trainer.staffLabel')"
        :written="drawnNotes"
        :columns="columns"
        :current="writing.current"
        @load-error="staffFailed = true"
        @drawn="store.noteDrawn()"
        @place="store.place"
        @step-up="store.stepUp()"
        @step-down="store.stepDown()"
        @previous-note="store.previousNote()"
        @next-note="store.nextNote()"
        @check="check"
      />

      <div v-if="several" class="pair">
        <button type="button" :disabled="!hasOpenNoteBefore(writing)" @click="store.previousNote()">
          {{ t('trainer.previousNote') }}
        </button>
        <button type="button" :disabled="!hasOpenNoteAfter(writing)" @click="store.nextNote()">
          {{ t('trainer.nextNote') }}
        </button>
      </div>

      <!-- No answer before the staff is drawn, so loading time is never timed. Empty cells keep
           the place of the buttons, so nothing jumps when they appear. -->
      <div class="pair">
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

      <!-- All three whenever signs are asked: a natural offered only when needed would tell. -->
      <div v-if="current.signs" class="signs">
        <template v-if="store.staffReady">
          <button
            v-for="each in SIGNS"
            :key="each.sign"
            type="button"
            class="sign"
            :aria-label="t(each.name)"
            :aria-pressed="writing.accidental === each.sign"
            :disabled="signsDisabled"
            @click="each.toggle"
          >
            {{ each.symbol }}
          </button>
        </template>
        <template v-else>
          <span v-for="each in SIGNS" :key="each.sign" class="placeholder" />
        </template>
      </div>

      <DurationRow
        v-if="writing.askDuration"
        :durations="current.durations"
        :dots="current.dots"
        :ready="store.staffReady"
        :selected="writing.selectedDuration?.value ?? null"
        :dot="writing.dot"
        :is-disabled="isDurationDisabled"
        :dot-disabled="isDotDisabled"
        :marks="durationMarks"
        shapes
        @choose="(value) => store.selectDuration({ value })"
        @dot="store.toggleDot()"
      />
      <!-- Descriptions of the marked buttons: a mark must reach a screen reader, not only the eye. -->
      <span v-if="hasIncorrectMark" :id="incorrectMarkId" hidden>{{ t('trainer.incorrect') }}</span>
      <span v-if="hasCorrectMark" :id="correctMarkId" hidden>{{ t('trainer.correct') }}</span>

      <SessionStatus
        :review="reviewed"
        :message="message"
        :number="current.number"
        :correctness="correctness"
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

/* The notes of the task read as one sentence, which wraps like text. */
.task {
  margin: 0;
  padding: 0;
  list-style: none;
}

.task li {
  display: inline;
}

.task .current {
  font-weight: 700;
}

.pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-s);
}

.signs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-s);
}

/* As the toggles of Read notes: the signs read better larger than the text. */
.sign {
  font-size: 1.5em;
  line-height: 1;
}

.pair button:disabled,
.sign:disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}

.placeholder {
  min-height: var(--target-size);
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
