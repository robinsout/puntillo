<script setup lang="ts">
import { computed, inject, ref, shallowRef, useId, useTemplateRef, watch } from 'vue'
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
import StaffSurface from '@/presentation/session/StaffSurface.vue'
import {
  UiButton,
  UiCheckbox,
  UiDialog,
  UiDisclosure,
  UiOptionGrid,
  UiSegmented,
  UiSelect,
} from '@/presentation/ui'
import { DURATION_FRACTIONS } from '@/presentation/session/duration-fractions'
import HelpButton from './HelpButton.vue'
import { usePreferencesStore } from './preferences-store'
import { QUESTION_LENGTH_KEYS } from './question-length-name'

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

const opener = useTemplateRef('opener')
const open = ref(false)
const pitchExpanded = ref(true)
const rhythmExpanded = ref(false)
const signsExpanded = ref(false)
// As in the trainer, no retry after a failure: the text asks to reload the page.
const staffFailed = ref(false)
const ledgerLinesName = useId()
const questionLengthName = useId()
const keySignaturesName = useId()
const accidentalsName = useId()
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

const indexOf = (pitch: Pitch) =>
  String(RANGE_PITCHES.findIndex((offered) => isSamePitch(offered, pitch)))

const boundOptions = (bound: 'low' | 'high') =>
  RANGE_PITCHES.map((pitch, index) => {
    const change = bound === 'low' ? { low: pitch } : { high: pitch }
    return {
      value: String(index),
      label: optionText(pitch, change),
      disabled: !store.canCustomize(change),
    }
  })

function chooseBound(bound: 'low' | 'high', index: string) {
  const pitch = RANGE_PITCHES[Number(index)]
  if (!pitch) return
  store.customize(bound === 'low' ? { low: pitch } : { high: pitch })
}

const ledgerLineOptions = computed(() =>
  LEDGER_LINE_LIMITS.map((limit) => {
    const available = store.canCustomize({ ledgerLines: limit })
    return {
      value: limit,
      label: t(LEDGER_LINE_KEYS[limit]),
      disabled: !available,
      description: available ? undefined : t('preset.tooFewNotes'),
    }
  }),
)

const questionLengthOptions = computed(() =>
  QUESTION_LENGTHS.map((length) => {
    const available = store.canCustomize({ questionLength: length })
    return {
      value: length,
      label: t(QUESTION_LENGTH_KEYS[length]),
      disabled: !available,
      description: available ? undefined : t('preset.doesNotFit'),
    }
  }),
)

const keySignatureOptions = computed(() =>
  KEY_SIGNATURE_LIMITS.map((limit) => ({ value: limit, label: t(KEY_SIGNATURE_KEYS[limit]) })),
)

const accidentalOptions = computed(() =>
  ACCIDENTAL_SETS.map((set) => ({ value: set, label: t(ACCIDENTAL_KEYS[set]) })),
)

function show() {
  pitchExpanded.value = true
  rhythmExpanded.value = false
  signsExpanded.value = false
  newExample()
  open.value = true
}

// Not every engine gives the focus back to the opener when a modal dialog closes.
function onClose() {
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
  open.value = false
}
</script>

<template>
  <UiButton ref="opener" variant="quiet" @click="show">{{ t('preset.customize') }}</UiButton>
  <UiDialog v-model:open="open" :title="t('preset.customize')" variant="sheet" @close="onClose">
    <div class="example">
      <p v-if="staffFailed" role="alert">{{ t('trainer.staffLoadError') }}</p>
      <StaffSurface v-else-if="example">
        <StaffView
          :question="example"
          :label="t('preset.example')"
          single-line
          @load-error="staffFailed = true"
        />
      </StaffSurface>
    </div>

    <UiDisclosure v-model="pitchExpanded" :title="t('preset.pitch')">
      <div class="range">
        <UiSelect
          :model-value="indexOf(store.difficulty.range.low)"
          :label="t('preset.from')"
          :options="boundOptions('low')"
          stacked
          @update:model-value="chooseBound('low', $event)"
        >
          <template #aside>
            <HelpButton :parameter="t('preset.from')" @open="openHint('treble-staff', $event)" />
          </template>
        </UiSelect>
        <UiSelect
          :model-value="indexOf(store.difficulty.range.high)"
          :label="t('preset.to')"
          :options="boundOptions('high')"
          stacked
          @update:model-value="chooseBound('high', $event)"
        >
          <template #aside>
            <HelpButton :parameter="t('preset.to')" @open="openHint('treble-staff', $event)" />
          </template>
        </UiSelect>
      </div>

      <div class="group">
        <!-- The group is named by its own label; this caption is for the eye. -->
        <div class="caption">
          <span aria-hidden="true">{{ t('preset.ledgerLines') }}</span>
          <HelpButton
            :parameter="t('preset.ledgerLines')"
            @open="openHint('treble-staff', $event)"
          />
        </div>
        <UiSegmented
          :model-value="store.difficulty.ledgerLines"
          :label="t('preset.ledgerLines')"
          :name="ledgerLinesName"
          :options="ledgerLineOptions"
          @update:model-value="store.customize({ ledgerLines: $event })"
        />
      </div>
    </UiDisclosure>

    <UiDisclosure v-model="rhythmExpanded" :title="t('preset.rhythm')">
      <div class="group">
        <div class="caption">
          <span aria-hidden="true">{{ t('preset.questionLength') }}</span>
          <HelpButton
            :parameter="t('preset.questionLength')"
            @open="openHint('durations', $event)"
          />
        </div>
        <UiOptionGrid
          :model-value="store.difficulty.questionLength"
          :label="t('preset.questionLength')"
          label-hidden
          :name="questionLengthName"
          :options="questionLengthOptions"
          :columns="1"
          @update:model-value="store.customize({ questionLength: $event })"
        />
      </div>

      <fieldset class="group">
        <legend class="visually-hidden">{{ t('preset.timeSignatures') }}</legend>
        <div class="caption">
          <span aria-hidden="true">{{ t('preset.timeSignatures') }}</span>
          <HelpButton
            :parameter="t('preset.timeSignatures')"
            @open="openHint('durations', $event)"
          />
        </div>
        <div class="boxes">
          <div v-for="(timeSignature, index) in TIME_SIGNATURES" :key="index" class="box">
            <UiCheckbox
              :model-value="isChecked(timeSignature)"
              :disabled="timeSignatureReason(timeSignature) !== null"
              :aria-describedby="
                timeSignatureReason(timeSignature) === null
                  ? undefined
                  : `${timeSignatureReasonId}-${index}`
              "
              @update:model-value="store.customize({ timeSignature, on: $event })"
            >
              {{ timeSignatureText(timeSignature) }}
            </UiCheckbox>
            <span
              v-if="timeSignatureReason(timeSignature) !== null"
              :id="`${timeSignatureReasonId}-${index}`"
              class="reason"
            >
              {{ timeSignatureReason(timeSignature) }}
            </span>
          </div>
        </div>
      </fieldset>

      <fieldset class="group">
        <legend class="visually-hidden">{{ t('preset.durations') }}</legend>
        <div class="caption">
          <span aria-hidden="true">{{ t('preset.durations') }}</span>
          <HelpButton :parameter="t('preset.durations')" @open="openHint('durations', $event)" />
        </div>
        <div class="boxes">
          <div v-for="duration in DURATION_VALUES" :key="duration" class="box">
            <UiCheckbox
              :model-value="store.difficulty.durations.includes(duration)"
              :disabled="durationReason(duration) !== null"
              :aria-describedby="
                durationReason(duration) === null ? undefined : `${durationReasonId}-${duration}`
              "
              @update:model-value="store.customize({ duration, on: $event })"
            >
              {{ t(`trainer.duration.${duration}`) }}
              {{ DURATION_FRACTIONS[duration] }}
            </UiCheckbox>
            <span
              v-if="durationReason(duration) !== null"
              :id="`${durationReasonId}-${duration}`"
              class="reason"
            >
              {{ durationReason(duration) }}
            </span>
          </div>
        </div>
      </fieldset>

      <div class="choice">
        <UiCheckbox
          :model-value="store.difficulty.rests"
          @update:model-value="store.customize({ rests: $event })"
        >
          {{ t('preset.rests') }}
        </UiCheckbox>
        <HelpButton :parameter="t('preset.rests')" @open="openHint('durations', $event)" />
      </div>

      <div class="choice">
        <UiCheckbox
          :model-value="store.difficulty.dots"
          :disabled="dotsReason !== null"
          :aria-describedby="dotsReason === null ? undefined : dotsReasonId"
          @update:model-value="store.customize({ dots: $event })"
        >
          {{ t('preset.dots') }}
        </UiCheckbox>
        <HelpButton :parameter="t('preset.dots')" @open="openHint('durations', $event)" />
        <span v-if="dotsReason !== null" :id="dotsReasonId" class="reason">
          {{ dotsReason }}
        </span>
      </div>

      <div class="choice">
        <UiCheckbox
          :model-value="store.difficulty.askDuration"
          @update:model-value="store.customize({ askDuration: $event })"
        >
          {{ t('preset.askDuration') }}
        </UiCheckbox>
        <HelpButton :parameter="t('preset.askDuration')" @open="openHint('durations', $event)" />
      </div>
    </UiDisclosure>

    <UiDisclosure v-model="signsExpanded" :title="t('preset.signs')">
      <div class="group">
        <div class="caption">
          <span aria-hidden="true">{{ t('preset.keySignatures') }}</span>
          <HelpButton
            :parameter="t('preset.keySignatures')"
            @open="openHint('key-signatures', $event)"
          />
        </div>
        <UiSegmented
          :model-value="store.difficulty.keySignatures"
          :label="t('preset.keySignatures')"
          :name="keySignaturesName"
          :options="keySignatureOptions"
          @update:model-value="store.customize({ keySignatures: $event })"
        />
      </div>

      <div class="group">
        <div class="caption">
          <span aria-hidden="true">{{ t('preset.accidentals') }}</span>
          <HelpButton
            :parameter="t('preset.accidentals')"
            @open="openHint('accidentals', $event)"
          />
        </div>
        <UiOptionGrid
          :model-value="store.difficulty.accidentals"
          :label="t('preset.accidentals')"
          label-hidden
          :name="accidentalsName"
          :options="accidentalOptions"
          :columns="1"
          @update:model-value="store.customize({ accidentals: $event })"
        />
      </div>
    </UiDisclosure>

    <template #actions>
      <UiButton variant="primary" block @click="open = false">{{ t('preset.done') }}</UiButton>
    </template>
  </UiDialog>
  <component
    :is="hintDialog"
    v-if="hint && hintDialog"
    :topic="hint.topic"
    @close="closeHint"
    @read="readArticle"
  />
</template>

<style scoped>
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

.range {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-m);
}

.group {
  display: flex;
  flex-direction: column;
  gap: var(--space-s);
  min-width: 0;
  margin: 0;
  padding: 0;
  border: none;
}

.caption {
  display: flex;
  align-items: center;
  gap: var(--space-s);
}

/* Two columns keep the boxes in line whatever reason stands under one of them. */
.boxes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: var(--space-m);
}

.box {
  min-width: 0;
}

.choice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  column-gap: var(--space-s);
}

.reason {
  display: block;
  flex-basis: 100%;
  color: var(--color-text-muted);
  font-size: var(--font-size-s);
}
</style>
