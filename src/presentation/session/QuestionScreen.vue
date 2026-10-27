<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  useId,
  useTemplateRef,
  watch,
} from 'vue'
import { useI18n } from 'vue-i18n'
import {
  hasOpenNoteAfter,
  hasOpenNoteBefore,
  isNoteMarked,
  isNoteOpen,
  noteAnswerOf,
  type NoteChoice,
} from '@/application/trainer'
import { hearNotes, readPitch, type PitchReading } from '@/application/hearing'
import { keyOf, type PianoKey } from '@/domain/keyboard'
import { LETTERS } from '@/domain/pitch'
import type { Letter } from '@/domain/pitch'
import type { Duration } from '@/domain/question'
import {
  useKeySound,
  useMicrophone,
  useMidiInput,
  useScreenWakeLock,
} from '@/presentation/dependencies'
import { usePreferencesStore } from '@/presentation/preferences'
import { UiAnswerKey, UiButton } from '@/presentation/ui'
import { choiceMarks, isIncorrectMark } from './choice-marks'
import { DURATION_FRACTIONS } from './duration-fractions'
import { useNoteNames } from './note-names'
import { heardOnStaff } from './heard-note'
import { useNoteReview } from './note-review'
import DurationRow from './DurationRow.vue'
import KeyCaption from './KeyCaption.vue'
import { useFinePointer } from './fine-pointer'
import HearingIndicator from './HearingIndicator.vue'
import { useMicrophoneStatus } from './microphone-status'
import { useMidiStatus } from './midi-status'
import PianoKeyboard from './PianoKeyboard.vue'
import QuestionAction from './QuestionAction.vue'
import QuestionMain from './QuestionMain.vue'
import QuestionStaff, { type NoteTarget } from './QuestionStaff.vue'
import SessionBar from './SessionBar.vue'
import SessionStatus from './SessionStatus.vue'
import { useSessionStore } from './session-store'
import { readingMarks } from './staff-marks'
import { shortcutKeyOf, type Shortcut } from './shortcuts'
import ShortcutsHint from './ShortcutsHint.vue'
import StaffSurface from './StaffSurface.vue'
import { useShortcuts } from './use-shortcuts'
import { useWorkingOctave } from './working-octave'

const { t } = useI18n()
const store = useSessionStore()
const keySound = useKeySound()
const noteNames = useNoteNames()
const { nameOf, keyCaption, lang: namesLang } = noteNames

const preferences = usePreferencesStore()
const finePointer = useFinePointer()

const current = computed(() => store.question)

const staffFailed = ref(false)
const heading = useTemplateRef('heading')
const action = useTemplateRef('action')
const names = useTemplateRef('names')
const piano = useTemplateRef('piano')

const incorrectMarkId = useId()
const correctMarkId = useId()

const trainer = computed(() => current.value?.trainer)
const several = computed(() => (trainer.value?.question.notes.length ?? 0) > 1)
const keyboard = computed(() => current.value?.noteInput === 'keyboard')
// The instrument is the input: nothing on the screen chooses a note or checks the answer.
const heard = computed(() => current.value?.noteInput === 'microphone')
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

// Once the question is over its result is on the staff, in place of the answers under the notes.
const staffResult = computed(() => {
  const state = trainer.value
  if (!state || !current.value || outcome.value === null) return null
  const { noteInput } = current.value
  const answer = state.notes.map((choice) => noteAnswerOf(choice, noteInput, state.askDuration))
  return readingMarks(state.question, answer, {
    name: nameOf,
    yours: (name) => t('trainer.yours', { name }),
  })
})
const statusCardId = useId()

const noteTargets = computed((): NoteTarget[] | null => {
  const state = trainer.value
  if (!state || !several.value || !store.staffReady) return null
  return state.notes.map((choice, index) => ({
    caption: staffResult.value ? '' : captionOf(choice, state.askDuration),
    // A note played is not taken back, so with the microphone no other note can be chosen.
    open: !heard.value && isNoteOpen(state, index),
    marked: isNoteMarked(state, index),
  }))
})

const review = useNoteReview(noteNames)
const reviewed = computed(() =>
  outcome.value === 'incorrect' && trainer.value && current.value
    ? review(trainer.value, current.value.noteInput)
    : null,
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

// Both rows are marked alike: the choice rejected on the first attempt, and on the review the last
// choice if it is wrong and the right one. A name is right only with its alteration, which the
// button alone does not show.
function marksOf<T>(
  rejected: T | undefined,
  selected: T | undefined,
  right: T | undefined,
  selectedIsRight = selected === right,
) {
  const review = outcome.value === 'incorrect'
  return choiceMarks<T>(
    {
      rejected,
      wrong: review && !selectedIsRight ? selected : undefined,
      right: review ? right : undefined,
    },
    { incorrect: incorrectMarkId, correct: correctMarkId },
  )
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
const shownPitchMarks = computed(() => {
  if (heard.value) return []
  if (keyboard.value)
    return (current.value?.keys ?? []).map(({ number }) => keyMarks.value.markOf(number))
  return LETTERS.map(nameMarks.value.markOf)
})
const shownMarks = computed(() => [
  ...shownPitchMarks.value,
  ...offeredDurations.value.map(durationMarks.value.markOf),
])
const hasIncorrectMark = computed(() => shownMarks.value.some(isIncorrectMark))
const hasCorrectMark = computed(() => shownMarks.value.includes('correct'))

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

async function answerWithKey(key: PianoKey) {
  await choose(() => (store.autoNext ? store.answerKey(key) : store.pressKey(key)))
}

async function pressKey(key: PianoKey) {
  // A test can click a disabled key; a browser cannot.
  if (!isKeyDisabled(key)) keySound.play(key)
  await answerWithKey(key)
}

async function pressDuration(value: Duration['value']) {
  await choose(() =>
    store.autoNext ? store.answerDuration({ value }) : store.selectDuration({ value }),
  )
}

// The action button is swapped in place, so without this the focus would be lost.
const actionButton = () => action.value?.$el as HTMLButtonElement | undefined

async function focusAction() {
  await nextTick()
  actionButton()?.focus()
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
  const button = actionButton()
  if (button) button.focus()
  else
    buttonsOf(pitches.value)
      .find(({ tabIndex }) => tabIndex === 0)
      ?.focus()
}

// A key does what its button does, and nothing while the button is unavailable or not there.
const showsNames = computed(() => store.staffReady && !keyboard.value && !heard.value)
const asksDuration = computed(() => store.staffReady && !!current.value?.trainer.askDuration)
const showsSigns = computed(() => showsNames.value && !!current.value?.sharpsAndFlats)
const playsKeys = computed(() => store.staffReady && keyboard.value)

const octave = useWorkingOctave(
  () => current.value?.keys ?? [],
  () => trainer.value?.question,
)

function playFromKeyboard(letter: Letter, black: boolean) {
  const key = octave.keyOf(letter, black)
  if (playsKeys.value && key && !isKeyDisabled(key)) void pressKey(key)
}

// A key of the instrument is a key on the screen, even one beyond the keys shown. The box is read
// at the press, so clearing it takes effect at once.
const midiInput = useMidiInput()
function playFromMidi(key: PianoKey) {
  if (!playsKeys.value || !preferences.useMidi || isKeyDisabled(key)) return
  if (document.querySelector('dialog[open]')) return
  keySound.playMidi(key)
  void answerWithKey(key)
}
let stopListening = () => {}
onMounted(() => (stopListening = midiInput.onKey(playFromMidi)))
onBeforeUnmount(() => stopListening())

// Listens for the whole question screen; a note counts once the staff is drawn, as a press does.
// The sound of the keys stays silent, or the microphone would hear it back.
const microphone = useMicrophone()
async function playNote(key: PianoKey) {
  if (!store.staffReady || document.querySelector('dialog[open]')) return
  store.playNote(key)
  if (store.question?.trainer.outcome) await focusAction()
}
const reading = shallowRef<PitchReading | null>(null)
onMounted(() => {
  if (!heard.value) return
  const hear = hearNotes((key) => void playNote(key), preferences.tuning)
  const read = readPitch((next) => (reading.value = next), preferences.tuning)
  microphone.listen((frame) => {
    hear(frame)
    read(frame)
  })
})
onBeforeUnmount(() => microphone.stop())

// While the microphone cannot be used, its line is the message of the screen.
const microphoneStatus = useMicrophoneStatus(() => heard.value)
const microphoneProblem = computed(() => heard.value && microphoneStatus.problem.value)
const microphoneLine = computed(() => (heard.value ? microphoneStatus.line.value : null))
watch(microphoneProblem, (problem) => {
  if (problem) reading.value = null
})
// By the current note, by the last one once the question is checked. Frames may come while the
// microphone has a problem, as when it is denied from the start.
const staffHeard = computed(() => {
  const state = trainer.value
  if (!reading.value || !state || microphoneProblem.value) return null
  const column = staffResult.value ? state.question.notes.length - 1 : state.current
  const { clef, keySignature, notes } = state.question
  const current = (notes[column] ?? notes[0]).pitch
  return heardOnStaff(reading.value.key, column, clef, { current, keySignature })
})

// The player stands back from the device with an instrument in hand, not touching the screen.
const screenWakeLock = useScreenWakeLock()
onMounted(() => {
  if (heard.value) screenWakeLock.keepOn()
})
onBeforeUnmount(() => screenWakeLock.release())
const midi = useMidiStatus()
const midiLine = computed(() => (keyboard.value && preferences.useMidi ? midi.line.value : null))

// On a desktop the buttons show their keys.
const shortcutKey = (shortcut: Shortcut) =>
  finePointer.value ? shortcutKeyOf(shortcut) : undefined

const pianoShortcuts = computed(() => {
  const captions = new Map<number, string>()
  if (!finePointer.value) return captions
  for (const letter of LETTERS) {
    for (const black of [false, true]) {
      const shortcut = shortcutKeyOf(
        black ? { type: 'black', below: letter } : { type: 'name', letter },
      )
      const key = shortcut && octave.keyOf(letter, black)
      if (key) captions.set(key.number, shortcut.caption)
    }
  }
  return captions
})

async function closeShortcutsHint() {
  preferences.closeShortcutsHint()
  await nextTick()
  heading.value?.focus()
}

useShortcuts((shortcut) => {
  const state = trainer.value
  switch (shortcut.type) {
    case 'name':
      if (keyboard.value) playFromKeyboard(shortcut.letter, false)
      else if (showsNames.value && !isDisabled(shortcut.letter)) void pressName(shortcut.letter)
      return true
    case 'black':
      if (keyboard.value) playFromKeyboard(shortcut.below, true)
      return true
    case 'octave-down':
    case 'octave-up':
      if (playsKeys.value) octave.shift(shortcut.type === 'octave-up' ? 1 : -1)
      return true
    case 'sharp':
      if (showsSigns.value && !isAlterationDisabled.value) store.toggleSharp()
      return true
    case 'flat':
      if (showsSigns.value && !isAlterationDisabled.value) store.toggleFlat()
      return true
    case 'duration':
      if (
        asksDuration.value &&
        offeredDurations.value.includes(shortcut.value) &&
        !isDurationDisabled(shortcut.value)
      )
        void pressDuration(shortcut.value)
      return true
    case 'dot':
      if (asksDuration.value && current.value?.dots && !isDotDisabled.value) store.toggleDot()
      return true
    case 'confirm':
      if (outcome.value) void next()
      else if (store.staffReady && !store.autoNext && !heard.value) void check()
      return true
    case 'previous-note':
      if (state && noteTargets.value && !heard.value && hasOpenNoteBefore(state))
        store.previousNote()
      return true
    case 'next-note':
      if (state && noteTargets.value && !heard.value && hasOpenNoteAfter(state)) store.nextNote()
      return true
    case 'step-up':
    case 'step-down':
    case 'natural':
      return false
  }
})
</script>

<template>
  <QuestionMain v-if="current">
    <!-- Before the staff branch: the session can be finished even if the staff fails. -->
    <SessionBar :progress="current" @finish="store.finish()" />

    <h1 ref="heading" class="visually-hidden" tabindex="-1">{{ t('trainer.heading') }}</h1>

    <p v-if="staffFailed" class="staff-error" role="alert">{{ t('trainer.staffLoadError') }}</p>
    <template v-else>
      <div v-if="heard" class="hearing">
        <HearingIndicator v-if="!microphoneProblem" :reading="reading" />
        <div class="device-status-place">
          <p
            v-if="microphoneLine"
            role="status"
            class="device-status"
            :class="{ problem: microphoneProblem }"
          >
            {{ microphoneLine }}
          </p>
        </div>
        <UiButton v-if="microphoneProblem" variant="quiet" to="/settings">
          {{ t('trainer.changeNoteInput') }}
        </UiButton>
      </div>

      <StaffSurface>
        <QuestionStaff
          :question="current.trainer.question"
          :label="t('trainer.staffLabel')"
          :targets="noteTargets"
          :current="current.trainer.current"
          :caption-lang="namesLang"
          :result="staffResult"
          :result-id="staffResult ? statusCardId : undefined"
          :heard="staffHeard"
          @load-error="staffFailed = true"
          @drawn="store.noteDrawn()"
          @choose="store.goToNote"
        />
      </StaffSurface>

      <ShortcutsHint
        v-if="finePointer && !preferences.shortcutsHintClosed && !heard"
        @close="closeShortcutsHint"
      />

      <div v-if="noteTargets && !heard" class="moves">
        <UiButton :disabled="!hasOpenNoteBefore(current.trainer)" @click="store.previousNote()">
          {{ t('trainer.previousNote') }}
        </UiButton>
        <UiButton :disabled="!hasOpenNoteAfter(current.trainer)" @click="store.nextNote()">
          {{ t('trainer.nextNote') }}
        </UiButton>
      </div>

      <!-- No answer before the note is drawn, so loading time is never timed. Empty cells of
           the same layout keep the place of the buttons, so nothing jumps when they appear. -->
      <div data-testid="answer-controls" class="answer-controls">
        <p v-if="midiLine" role="status" class="device-status">{{ midiLine }}</p>
        <PianoKeyboard
          v-if="keyboard"
          ref="piano"
          :keys="current.keys"
          :ready="store.staffReady"
          :question="current.trainer.question"
          :pressed="current.trainer.key"
          :is-disabled="isKeyDisabled"
          :marks="keyMarks"
          :shortcuts="pianoShortcuts"
          @play="pressKey"
        />
        <div v-else-if="!heard" ref="names" class="names">
          <template v-if="store.staffReady">
            <UiAnswerKey
              v-for="letter in LETTERS"
              :key="letter"
              :pressed="current.trainer.selected === letter"
              :mark="nameMarks.markOf(letter)"
              :aria-describedby="nameMarks.describedBy(letter)"
              :disabled="isDisabled(letter)"
              :lang="namesLang"
              :aria-keyshortcuts="shortcutKey({ type: 'name', letter })?.name"
              @click="pressName(letter)"
              >{{ nameOf(letter) }}<KeyCaption :of="shortcutKey({ type: 'name', letter })"
            /></UiAnswerKey>
            <template v-if="current.sharpsAndFlats">
              <UiAnswerKey
                class="alteration"
                :aria-label="t('trainer.sharp')"
                :pressed="current.trainer.alteration === 1"
                :mark="null"
                :disabled="isAlterationDisabled"
                :aria-keyshortcuts="shortcutKey({ type: 'sharp' })?.name"
                @click="store.toggleSharp()"
              >
                ♯
                <KeyCaption :of="shortcutKey({ type: 'sharp' })" />
              </UiAnswerKey>
              <UiAnswerKey
                class="alteration"
                :aria-label="t('trainer.flat')"
                :pressed="current.trainer.alteration === -1"
                :mark="null"
                :disabled="isAlterationDisabled"
                :aria-keyshortcuts="shortcutKey({ type: 'flat' })?.name"
                @click="store.toggleFlat()"
              >
                ♭
                <KeyCaption :of="shortcutKey({ type: 'flat' })" />
              </UiAnswerKey>
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
          :shortcuts="finePointer"
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
          :card-id="statusCardId"
        />

        <!-- The quick mode answers on the last part chosen, so it has no Check; it stops on a review
             only, which Next leaves once it is read. The microphone checks by itself, so its cell
             stays empty until Next. -->
        <QuestionAction v-if="outcome || !store.autoNext || heard">
          <UiButton v-if="outcome" ref="action" variant="primary" size="l" block @click="next">
            {{ current.isLast ? t('session.toResults') : t('trainer.next') }}
          </UiButton>
          <UiButton
            v-else-if="store.staffReady && !heard"
            ref="action"
            variant="primary"
            size="l"
            block
            @click="check"
          >
            {{ t('trainer.check') }}
          </UiButton>
        </QuestionAction>
      </div>
    </template>
  </QuestionMain>
</template>

<style scoped>
.moves {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-s);
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

.staff-error {
  margin: 0;
}

.device-status {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-s);
}

/* Holds the line before the browser answers, so the staff does not move down when it does. */
.device-status-place {
  min-height: 1lh;
  font-size: var(--font-size-s);
}

.device-status.problem {
  color: var(--color-text);
  font-size: var(--font-size-m);
}

.hearing {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-xs);
}
</style>
