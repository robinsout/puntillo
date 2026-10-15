<script setup lang="ts">
import { computed, nextTick, ref, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { hasOpenNoteAfter, hasOpenNoteBefore, isNoteMarked } from '@/application/trainer'
import type { Pitch } from '@/domain/pitch'
import { noteName } from '@/domain/naming'
import { isSameDuration, type Accidental, type Duration, type WrittenNote } from '@/domain/question'
import { stepFromBottomLine } from '@/domain/staff'
import { usePreferencesStore } from '@/presentation/preferences'
import { choiceMarks, isIncorrectMark } from './choice-marks'
import DurationRow, { type DurationMarks } from './DurationRow.vue'
import { useFinePointer } from './fine-pointer'
import KeyCaption from './KeyCaption.vue'
import { soundingSign, useWritingReview, type Spell } from './note-review'
import { useSessionStore } from './session-store'
import { writingMarks } from './staff-marks'
import SessionBar from './SessionBar.vue'
import SessionStatus from './SessionStatus.vue'
import { shortcutKeyOf, type Shortcut } from './shortcuts'
import ShortcutsHint from './ShortcutsHint.vue'
import { useShortcuts } from './use-shortcuts'
import WritingStaff, { type NoteColumn } from './WritingStaff.vue'

const { t } = useI18n()
const store = useSessionStore()
const preferences = usePreferencesStore()
const finePointer = useFinePointer()

const current = computed(() => store.writing)
const writing = computed(() => current.value?.writing)
const outcome = computed(() => writing.value?.outcome ?? null)
const secondAttempt = computed(() => !!writing.value?.firstGrade && outcome.value === null)
const several = computed(() => (writing.value?.question.notes.length ?? 0) > 1)

const staffFailed = ref(false)
const heading = useTemplateRef('heading')
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

// Until its duration is chosen, a written note is a bare head.
const drawnNotes = computed((): (WrittenNote | null)[] => {
  const state = writing.value
  if (!state) return []
  return state.question.notes.map(({ duration }, index) => {
    const { placed, accidental, selectedDuration } = state.notes[index] ?? {}
    if (!placed) return null
    return {
      pitch: placed,
      duration: state.askDuration ? (selectedDuration ?? null) : duration,
      ...(accidental && { accidental }),
    }
  })
})

// Once the question is over its result is on the staff, in place of the names of the notes.
const staffResult = computed(() => {
  const state = writing.value
  if (!state || outcome.value === null) return null
  const written = state.notes.map(({ placed, accidental, selectedDuration }): WrittenNote => ({
    pitch: placed as Pitch,
    duration: state.askDuration ? selectedDuration : null,
    ...(accidental && { accidental }),
  }))
  return writingMarks(state.question, written, {
    spell,
    yours: (name) => t('trainer.yours', { name }),
  })
})
const statusCardId = useId()

const columns = computed((): NoteColumn[] => {
  const state = writing.value
  if (!state) return []
  return state.notes.map(({ placed, accidental }, index) => ({
    valueText: placed ? writtenName(placed, accidental) : t('writing.noNote'),
    step: placed && stepFromBottomLine(placed, state.question.clef),
    marked: isNoteMarked(state, index),
    caption:
      preferences.showNoteNames && placed && !staffResult.value
        ? writtenName(placed, accidental)
        : '',
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

// As in Read notes: the rejected duration, and on the review a wrong one and the right one.
const durationMarks = computed((): DurationMarks => {
  const selected = writing.value?.selectedDuration
  const right = currentNote.value?.duration
  const review = outcome.value === 'incorrect'
  const selectedIsWrong = !!selected && !!right && !isSameDuration(selected, right)
  return choiceMarks(
    {
      rejected: rejectedValue.value,
      wrong: review && selectedIsWrong ? selected?.value : undefined,
      right: review ? right?.value : undefined,
    },
    { incorrect: incorrectMarkId, correct: correctMarkId },
  )
})

const offeredDurations = computed(() => current.value?.durations ?? [])
const shownMarks = computed(() => offeredDurations.value.map(durationMarks.value.markOf))
const hasIncorrectMark = computed(() => shownMarks.value.some(isIncorrectMark))
const hasCorrectMark = computed(() => shownMarks.value.includes('correct'))

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

// On a desktop the buttons show their keys.
const shortcutKey = (shortcut: Shortcut) =>
  finePointer.value ? shortcutKeyOf(shortcut) : undefined

async function closeShortcutsHint() {
  preferences.closeShortcutsHint()
  await nextTick()
  heading.value?.focus()
}

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
    <!-- Before the staff branch: the session can be finished even if the staff fails. -->
    <SessionBar :progress="current" @finish="store.finish()" />

    <h1 ref="heading" tabindex="-1">{{ t('writing.heading') }}</h1>
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
        :result="staffResult"
        :result-id="staffResult ? statusCardId : undefined"
        :caption-lang="namesLang"
        @load-error="staffFailed = true"
        @drawn="store.noteDrawn()"
        @place="store.place"
        @step-up="store.stepUp()"
        @step-down="store.stepDown()"
        @previous-note="store.previousNote()"
        @next-note="store.nextNote()"
        @check="check"
      />

      <ShortcutsHint
        v-if="finePointer && !preferences.shortcutsHintClosed"
        @close="closeShortcutsHint"
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
            :aria-keyshortcuts="shortcutKey({ type: 'step-up' })?.name"
            @click="store.stepUp()"
          >
            ▲
            <KeyCaption :of="shortcutKey({ type: 'step-up' })" />
          </button>
          <button
            type="button"
            :aria-label="t('writing.stepDown')"
            :disabled="!writing.canStepDown"
            :aria-keyshortcuts="shortcutKey({ type: 'step-down' })?.name"
            @click="store.stepDown()"
          >
            ▼
            <KeyCaption :of="shortcutKey({ type: 'step-down' })" />
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
            :aria-keyshortcuts="shortcutKey({ type: each.sign })?.name"
            @click="each.toggle"
          >
            {{ each.symbol }}
            <KeyCaption :of="shortcutKey({ type: each.sign })" />
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
        :shortcuts="finePointer"
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
        :card-id="statusCardId"
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
    </template>
  </main>
</template>

<style scoped>
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
  font-weight: var(--font-weight-bold);
}

.pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-s);
}

.pair button,
.sign {
  position: relative;
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

.primary {
  align-self: flex-start;
}

.staff-error {
  margin: 0;
}
</style>
