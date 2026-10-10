<script setup lang="ts">
import { computed, inject, nextTick, ref, shallowRef, useId, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { createQuestionGenerator } from '@/application/question-generation'
import {
  ACCIDENTAL_SETS,
  KEY_SIGNATURE_LIMITS,
  LEDGER_LINE_LIMITS,
  QUESTION_LENGTHS,
  RANGE_PITCHES,
  type DifficultyChange,
  type AccidentalSet,
  type KeySignatureLimit,
  type LedgerLineLimit,
  type QuestionLength,
} from '@/domain/difficulty'
import { noteName } from '@/domain/naming'
import { isSamePitch, type Pitch } from '@/domain/pitch'
import {
  DURATION_VALUES,
  isSameTimeSignature,
  TIME_SIGNATURES,
  type Duration,
  type Question,
  type TimeSignature,
} from '@/domain/question'
import { StaffView } from '@/infrastructure/notation'
import type { WikiTopic } from '@/domain/wiki'
import { randomKey } from '@/presentation/dependencies'
import { DURATION_FRACTIONS } from '@/presentation/session/duration-fractions'
import HelpButton from './HelpButton.vue'
import { usePreferencesStore } from './preferences-store'

const { t } = useI18n()
const store = usePreferencesStore()
const random = inject(randomKey)
if (!random) throw new Error('Random source is not provided: provide it with randomKey')

const LEDGER_LINE_KEYS: Record<LedgerLineLimit, string> = {
  0: 'preset.ledgerLine.none',
  1: 'preset.ledgerLine.upToOne',
  2: 'preset.ledgerLine.upToTwo',
}

const KEY_SIGNATURE_KEYS: Record<KeySignatureLimit, string> = {
  0: 'preset.keySignature.none',
  2: 'preset.keySignature.upToTwo',
  4: 'preset.keySignature.upToFour',
  7: 'preset.keySignature.all',
}

const ACCIDENTAL_KEYS: Record<AccidentalSet, string> = {
  none: 'preset.accidental.none',
  'sharp-and-flat': 'preset.accidental.sharpAndFlat',
  'sharp-flat-and-natural': 'preset.accidental.sharpFlatAndNatural',
}

const LENGTH_KEYS: Record<QuestionLength, string> = {
  'one-note': 'preset.length.oneNote',
  'two-to-four-notes': 'preset.length.severalNotes',
  'one-bar': 'preset.length.oneBar',
  'two-bars': 'preset.length.twoBars',
}

const dialog = useTemplateRef('dialog')
const opener = useTemplateRef('opener')
const open = ref(false)
const pitchExpanded = ref(true)
const rhythmExpanded = ref(false)
const signsExpanded = ref(false)
// As in the trainer, no retry after a failure: the text asks to reload the page.
const staffFailed = ref(false)
const pitchSectionId = useId()
const rhythmSectionId = useId()
const signsSectionId = useId()
const keySignaturesName = useId()
const accidentalsName = useId()
const fromId = useId()
const toId = useId()
const ledgerLinesName = useId()
const tooFewNotesId = useId()
const questionLengthName = useId()
const doesNotFitId = useId()
const durationReasonId = useId()
const timeSignatureReasonId = useId()
const dotsReasonId = useId()

const example = shallowRef<Question>()
const newExample = () => {
  example.value = createQuestionGenerator(random, store.difficulty)()
}
watch(() => store.difficulty, newExample)

const pitchName = (pitch: Pitch) =>
  `${noteName(pitch.letter, store.noteNaming, store.seventhNote)}${pitch.octave}`

function optionText(pitch: Pitch, change: DifficultyChange) {
  return store.canCustomize(change)
    ? pitchName(pitch)
    : t('preset.unavailable', { value: pitchName(pitch), reason: t('preset.tooFewNotes') })
}

// Null while the duration can be turned off.
function durationReason(duration: Duration['value']): string | null {
  if (store.canCustomize({ duration, on: false })) return null
  const { durations } = store.difficulty
  const isLast = durations.length === 1 && durations[0] === duration
  return t(isLast ? 'preset.atLeastOneDuration' : 'preset.doesNotFit')
}

const timeSignatureText = ({ beats, beatValue }: TimeSignature) => `${beats}/${beatValue}`

const isChecked = (timeSignature: TimeSignature) =>
  store.difficulty.timeSignatures.some((checked) => isSameTimeSignature(checked, timeSignature))

// Null while the time signature can be turned off.
function timeSignatureReason(timeSignature: TimeSignature): string | null {
  if (store.canCustomize({ timeSignature, on: false })) return null
  const isLast = store.difficulty.timeSignatures.length === 1 && isChecked(timeSignature)
  return t(isLast ? 'preset.atLeastOneTimeSignature' : 'preset.doesNotFit')
}

// Turning the dots off is the only change that can leave no question.
const dotsReason = computed(() =>
  store.canCustomize({ dots: !store.difficulty.dots }) ? null : t('preset.doesNotFit'),
)

const indexOf = (pitch: Pitch) => RANGE_PITCHES.findIndex((offered) => isSamePitch(offered, pitch))

function chooseBound(bound: 'low' | 'high', event: Event) {
  const pitch = RANGE_PITCHES[Number((event.target as HTMLSelectElement).value)]
  if (!pitch) return
  store.customize(bound === 'low' ? { low: pitch } : { high: pitch })
}

async function show() {
  pitchExpanded.value = true
  rhythmExpanded.value = false
  signsExpanded.value = false
  newExample()
  open.value = true
  await nextTick()
  dialog.value?.showModal()
}

// Not every engine gives the focus back to the opener when a modal dialog closes.
function onClose() {
  open.value = false
  opener.value?.focus()
}

const hint = shallowRef<{ readonly topic: WikiTopic; readonly opener: HTMLButtonElement } | null>(
  null,
)

// Spec §18: the hints come with the wiki, outside the initial bundle.
const hintDialog = shallowRef<typeof import('@/presentation/wiki/HintDialog.vue').default>()

async function openHint(topic: Exclude<WikiTopic, 'keys'>, opener: HTMLButtonElement) {
  hintDialog.value ??= (await import('@/presentation/wiki/HintDialog.vue')).default
  hint.value = { topic, opener }
}

// Not every engine gives the focus back to the opener when a modal dialog closes.
function closeHint() {
  const opener = hint.value?.opener
  hint.value = null
  opener?.focus()
}

// The settings apply at once, so leaving for the article loses nothing.
function readArticle() {
  hint.value = null
  dialog.value?.close()
}

// The content fills the dialog box, so only a press on the backdrop targets the dialog itself.
function onClick(event: MouseEvent) {
  if (event.target === dialog.value) dialog.value?.close()
}
</script>

<template>
  <button ref="opener" type="button" class="opener" @click="show">
    {{ t('preset.customize') }}
  </button>
  <dialog
    ref="dialog"
    class="panel"
    :aria-label="t('preset.customize')"
    @close="onClose"
    @click="onClick"
  >
    <div v-if="open" class="content">
      <div class="example">
        <p v-if="staffFailed" role="alert">{{ t('trainer.staffLoadError') }}</p>
        <StaffView
          v-else-if="example"
          :question="example"
          :label="t('preset.example')"
          single-line
          @load-error="staffFailed = true"
        />
      </div>

      <button
        type="button"
        class="section"
        :aria-expanded="pitchExpanded"
        :aria-controls="pitchSectionId"
        @click="pitchExpanded = !pitchExpanded"
      >
        {{ t('preset.pitch') }}
      </button>
      <div v-if="pitchExpanded" :id="pitchSectionId" class="values">
        <div class="range">
          <div class="bound">
            <div class="caption">
              <label :for="fromId">{{ t('preset.from') }}</label>
              <HelpButton :parameter="t('preset.from')" @open="openHint('treble-staff', $event)" />
            </div>
            <select
              :id="fromId"
              :value="indexOf(store.difficulty.range.low)"
              @change="chooseBound('low', $event)"
            >
              <option
                v-for="(pitch, index) in RANGE_PITCHES"
                :key="index"
                :value="index"
                :disabled="!store.canCustomize({ low: pitch })"
              >
                {{ optionText(pitch, { low: pitch }) }}
              </option>
            </select>
          </div>
          <div class="bound">
            <div class="caption">
              <label :for="toId">{{ t('preset.to') }}</label>
              <HelpButton :parameter="t('preset.to')" @open="openHint('treble-staff', $event)" />
            </div>
            <select
              :id="toId"
              :value="indexOf(store.difficulty.range.high)"
              @change="chooseBound('high', $event)"
            >
              <option
                v-for="(pitch, index) in RANGE_PITCHES"
                :key="index"
                :value="index"
                :disabled="!store.canCustomize({ high: pitch })"
              >
                {{ optionText(pitch, { high: pitch }) }}
              </option>
            </select>
          </div>
        </div>

        <fieldset>
          <legend>{{ t('preset.ledgerLines') }}</legend>
          <HelpButton
            :parameter="t('preset.ledgerLines')"
            @open="openHint('treble-staff', $event)"
          />
          <div v-for="limit in LEDGER_LINE_LIMITS" :key="limit" class="choice">
            <label>
              <input
                type="radio"
                :name="ledgerLinesName"
                :checked="store.difficulty.ledgerLines === limit"
                :disabled="!store.canCustomize({ ledgerLines: limit })"
                :aria-describedby="
                  store.canCustomize({ ledgerLines: limit })
                    ? undefined
                    : `${tooFewNotesId}-${limit}`
                "
                @change="store.customize({ ledgerLines: limit })"
              />
              {{ t(LEDGER_LINE_KEYS[limit]) }}
            </label>
            <span
              v-if="!store.canCustomize({ ledgerLines: limit })"
              :id="`${tooFewNotesId}-${limit}`"
              class="reason"
            >
              {{ t('preset.tooFewNotes') }}
            </span>
          </div>
        </fieldset>
      </div>

      <button
        type="button"
        class="section"
        :aria-expanded="rhythmExpanded"
        :aria-controls="rhythmSectionId"
        @click="rhythmExpanded = !rhythmExpanded"
      >
        {{ t('preset.rhythm') }}
      </button>
      <div v-if="rhythmExpanded" :id="rhythmSectionId" class="values">
        <fieldset>
          <legend>{{ t('preset.questionLength') }}</legend>
          <HelpButton
            :parameter="t('preset.questionLength')"
            @open="openHint('durations', $event)"
          />
          <div v-for="length in QUESTION_LENGTHS" :key="length" class="choice">
            <label>
              <input
                type="radio"
                :name="questionLengthName"
                :checked="store.difficulty.questionLength === length"
                :disabled="!store.canCustomize({ questionLength: length })"
                :aria-describedby="
                  store.canCustomize({ questionLength: length })
                    ? undefined
                    : `${doesNotFitId}-${length}`
                "
                @change="store.customize({ questionLength: length })"
              />
              {{ t(LENGTH_KEYS[length]) }}
            </label>
            <span
              v-if="!store.canCustomize({ questionLength: length })"
              :id="`${doesNotFitId}-${length}`"
              class="reason"
            >
              {{ t('preset.doesNotFit') }}
            </span>
          </div>
        </fieldset>

        <fieldset>
          <legend>{{ t('preset.timeSignatures') }}</legend>
          <HelpButton
            :parameter="t('preset.timeSignatures')"
            @open="openHint('durations', $event)"
          />
          <div v-for="(timeSignature, index) in TIME_SIGNATURES" :key="index" class="choice">
            <label>
              <input
                type="checkbox"
                :checked="isChecked(timeSignature)"
                :disabled="timeSignatureReason(timeSignature) !== null"
                :aria-describedby="
                  timeSignatureReason(timeSignature) === null
                    ? undefined
                    : `${timeSignatureReasonId}-${index}`
                "
                @change="
                  store.customize({
                    timeSignature,
                    on: ($event.target as HTMLInputElement).checked,
                  })
                "
              />
              {{ timeSignatureText(timeSignature) }}
            </label>
            <span
              v-if="timeSignatureReason(timeSignature) !== null"
              :id="`${timeSignatureReasonId}-${index}`"
              class="reason"
            >
              {{ timeSignatureReason(timeSignature) }}
            </span>
          </div>
        </fieldset>

        <fieldset>
          <legend>{{ t('preset.durations') }}</legend>
          <HelpButton :parameter="t('preset.durations')" @open="openHint('durations', $event)" />
          <div v-for="duration in DURATION_VALUES" :key="duration" class="choice">
            <label>
              <input
                type="checkbox"
                :checked="store.difficulty.durations.includes(duration)"
                :disabled="durationReason(duration) !== null"
                :aria-describedby="
                  durationReason(duration) === null ? undefined : `${durationReasonId}-${duration}`
                "
                @change="
                  store.customize({
                    duration,
                    on: ($event.target as HTMLInputElement).checked,
                  })
                "
              />
              {{ t(`trainer.duration.${duration}`) }}
              {{ DURATION_FRACTIONS[duration] }}
            </label>
            <span
              v-if="durationReason(duration) !== null"
              :id="`${durationReasonId}-${duration}`"
              class="reason"
            >
              {{ durationReason(duration) }}
            </span>
          </div>
        </fieldset>

        <div class="choice">
          <label>
            <input
              type="checkbox"
              :checked="store.difficulty.rests"
              @change="store.customize({ rests: ($event.target as HTMLInputElement).checked })"
            />
            {{ t('preset.rests') }}
          </label>
          <HelpButton :parameter="t('preset.rests')" @open="openHint('durations', $event)" />
        </div>

        <div class="choice">
          <label>
            <input
              type="checkbox"
              :checked="store.difficulty.dots"
              :disabled="dotsReason !== null"
              :aria-describedby="dotsReason === null ? undefined : dotsReasonId"
              @change="store.customize({ dots: ($event.target as HTMLInputElement).checked })"
            />
            {{ t('preset.dots') }}
          </label>
          <HelpButton :parameter="t('preset.dots')" @open="openHint('durations', $event)" />
          <span v-if="dotsReason !== null" :id="dotsReasonId" class="reason">
            {{ dotsReason }}
          </span>
        </div>

        <div class="choice">
          <label>
            <input
              type="checkbox"
              :checked="store.difficulty.askDuration"
              @change="
                store.customize({ askDuration: ($event.target as HTMLInputElement).checked })
              "
            />
            {{ t('preset.askDuration') }}
          </label>
          <HelpButton :parameter="t('preset.askDuration')" @open="openHint('durations', $event)" />
        </div>
      </div>

      <button
        type="button"
        class="section"
        :aria-expanded="signsExpanded"
        :aria-controls="signsSectionId"
        @click="signsExpanded = !signsExpanded"
      >
        {{ t('preset.signs') }}
      </button>
      <div v-if="signsExpanded" :id="signsSectionId" class="values">
        <fieldset>
          <legend>{{ t('preset.keySignatures') }}</legend>
          <HelpButton
            :parameter="t('preset.keySignatures')"
            @open="openHint('key-signatures', $event)"
          />
          <div v-for="limit in KEY_SIGNATURE_LIMITS" :key="limit" class="choice">
            <label>
              <input
                type="radio"
                :name="keySignaturesName"
                :checked="store.difficulty.keySignatures === limit"
                @change="store.customize({ keySignatures: limit })"
              />
              {{ t(KEY_SIGNATURE_KEYS[limit]) }}
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend>{{ t('preset.accidentals') }}</legend>
          <HelpButton
            :parameter="t('preset.accidentals')"
            @open="openHint('accidentals', $event)"
          />
          <div v-for="set in ACCIDENTAL_SETS" :key="set" class="choice">
            <label>
              <input
                type="radio"
                :name="accidentalsName"
                :checked="store.difficulty.accidentals === set"
                @change="store.customize({ accidentals: set })"
              />
              {{ t(ACCIDENTAL_KEYS[set]) }}
            </label>
          </div>
        </fieldset>
      </div>

      <button type="button" class="primary done" @click="dialog?.close()">
        {{ t('preset.done') }}
      </button>
    </div>
  </dialog>
  <component
    :is="hintDialog"
    v-if="hint && hintDialog"
    :topic="hint.topic"
    @close="closeHint"
    @read="readArticle"
  />
</template>

<style scoped>
.opener {
  align-self: flex-start;
}

/* A bottom sheet on a narrow screen; the strip left above it is the backdrop to press. */
.panel {
  width: 100%;
  max-width: 100%;
  max-height: calc(100dvh - var(--target-size));
  margin: auto 0 0;
  padding: 0;
  border: none;
  border-radius: var(--radius) var(--radius) 0 0;
  color: var(--color-text);
  background: var(--color-surface);
}

/* A side panel on a wide one, the page still in view beside it. */
@media (width >= 40rem) {
  .panel {
    width: min(24rem, 50vw);
    height: 100dvh;
    max-height: 100dvh;
    margin: 0 0 0 auto;
    border-radius: 0;
  }
}

.panel::backdrop {
  background: rgb(0 0 0 / 0.4);
}

.content {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
  min-height: 100%;
  padding: var(--space-m) max(var(--space-m), env(safe-area-inset-right))
    max(var(--space-m), env(safe-area-inset-bottom)) max(var(--space-m), env(safe-area-inset-left));
}

/* Criterion 9: the example stays in view while the values scroll under it. */
.example {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--color-surface);
}

.example p {
  margin: 0;
}

.section {
  text-align: start;
  font-weight: 700;
}

.section::after {
  content: ' ▸' / '';
}

.section[aria-expanded='true']::after {
  content: ' ▾' / '';
}

.values {
  display: flex;
  flex-direction: column;
  gap: var(--space-m);
}

.range {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-s);
}

.bound {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* An option names its reason, so a list would grow to its longest text without this. */
.range select {
  width: 100%;
}

fieldset {
  display: flex;
  flex-wrap: wrap;
  column-gap: var(--space-m);
  margin: 0;
  padding: 0;
  border: none;
}

/* Floated, the legend is an item of the flex box like the help button after it, not the caption on the border. */
legend {
  float: inline-start;
  padding: 0;
  line-height: var(--target-size);
}

fieldset::before {
  content: '';
  flex-basis: 100%;
  order: 1;
}

fieldset > .choice {
  order: 2;
}

.choice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: var(--space-s);
}

.caption {
  display: flex;
  align-items: center;
  gap: var(--space-s);
}

.choice label {
  display: flex;
  align-items: center;
  gap: var(--space-s);
  min-width: var(--target-size);
  min-height: var(--target-size);
  cursor: pointer;
}

.choice input {
  width: 1.25em;
  height: 1.25em;
  margin: 0;
  accent-color: var(--color-accent);
}

.choice input:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

.reason {
  color: var(--color-text-muted);
}

.done {
  margin-top: auto;
  align-self: flex-start;
}
</style>
