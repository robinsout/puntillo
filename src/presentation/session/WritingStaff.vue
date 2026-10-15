<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Pitch } from '@/domain/pitch'
import type { Question, WrittenNote } from '@/domain/question'
import { pitchAtStep } from '@/domain/staff'
import { StaffView, stepAt, type StaffLayout } from '@/infrastructure/notation'
import { MAX_BAR_WIDTH } from './bar-width'
import { noteBoxes } from './note-boxes'
import StaffCaptions from './StaffCaptions.vue'
import type { StaffMark } from './staff-marks'

export interface NoteColumn {
  // What the column holds for a screen reader: the written note or that there is none.
  readonly valueText: string
  readonly step: number | null
  readonly marked: boolean
  // The name under the staff for a beginner, empty for none.
  readonly caption: string
  readonly captionLang?: string
}

const props = defineProps<{
  question: Question
  label: string
  // The notes drawn on the staff, one per note of the question, null for none.
  written: readonly (WrittenNote | null)[]
  columns: readonly NoteColumn[]
  current: number
  // Once the question is checked; the ghosts are the right notes.
  result?: readonly StaffMark[] | null
  // The element that says the result to a screen reader.
  resultId?: string
  captionLang?: string
}>()
const emit = defineEmits<{
  drawn: []
  'load-error': []
  place: [pitch: Pitch, index: number]
  'step-up': []
  'step-down': []
  'previous-note': []
  'next-note': []
  check: []
}>()

const { t } = useI18n()
const incorrectMarkId = useId()
const staff = useTemplateRef('staff')

// The layout of an earlier question must not place the columns of this one.
const drawn = shallowRef<{ question: Question; layout: StaffLayout }>()
function onDrawn(layout: StaffLayout) {
  drawn.value = { question: props.question, layout }
  emit('drawn')
}

const layout = computed(() =>
  drawn.value?.question === props.question ? drawn.value.layout : undefined,
)
const boxes = computed(() => (layout.value ? noteBoxes(layout.value) : []))

// The captions of the result may reach below the drawing; the staff grows to hold them.
const captionRoom = ref(0)
const roomStyle = computed(() =>
  props.result && captionRoom.value > 0 ? { marginBottom: `${captionRoom.value}px` } : undefined,
)

// Once the question is checked no note is current any more.
const highlighted = computed(() => (props.result ? -1 : props.current))

const marks = computed(() => props.result?.map(({ mark }) => mark))
const ghosts = computed(() =>
  props.result?.map(({ ghost }) => ghost && { pitch: ghost, mark: 'correct' as const }),
)

// The touch is read against the whole drawing, which the layout gives its lines in fractions of.
function touch(event: MouseEvent, index: number) {
  const line = layout.value?.lines[layout.value.notes[index]?.line ?? -1]
  const drawing = staff.value?.getBoundingClientRect()
  if (!line || !drawing || drawing.height === 0) return
  const step = stepAt((event.clientY - drawing.top) / drawing.height, line)
  emit('place', pitchAtStep(step, props.question.clef), index)
}

// ARIA APG "Slider": the arrow keys up and down move the value; left and right go to the
// neighbouring note, as in Read notes, the focus following; Enter checks.
async function press(event: KeyboardEvent) {
  const actions: Partial<Record<string, () => void>> = {
    ArrowUp: () => emit('step-up'),
    ArrowDown: () => emit('step-down'),
    ArrowLeft: () => emit('previous-note'),
    ArrowRight: () => emit('next-note'),
    Enter: () => emit('check'),
  }
  const action = actions[event.key]
  if (!action) return
  event.preventDefault()
  action()
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  await nextTick()
  staff.value?.querySelectorAll<HTMLElement>('[role="slider"]')[props.current]?.focus()
}
</script>

<template>
  <div ref="staff" class="staff" :style="roomStyle">
    <StaffView
      :question="question"
      :label="label"
      :max-bar-width="MAX_BAR_WIDTH"
      :written="written"
      :marks="marks"
      :ghosts="ghosts"
      :aria-describedby="resultId"
      @load-error="emit('load-error')"
      @drawn="onDrawn"
    />
    <div
      v-for="(box, index) in boxes"
      :key="index"
      role="slider"
      tabindex="0"
      class="column"
      :class="{ current: index === highlighted, marked: columns[index]?.marked }"
      :style="box"
      :aria-label="t('trainer.note', { number: index + 1 })"
      :aria-current="index === highlighted ? 'true' : undefined"
      aria-orientation="vertical"
      :aria-valuenow="columns[index]?.step ?? undefined"
      :aria-valuetext="columns[index]?.valueText"
      :aria-describedby="columns[index]?.marked ? incorrectMarkId : undefined"
      @click="touch($event, index)"
      @keydown="press"
    >
      <!-- The value of the slider says the same to a screen reader. -->
      <span
        v-if="columns[index]?.caption"
        class="caption"
        aria-hidden="true"
        :lang="columns[index]?.captionLang"
        >{{ columns[index]?.caption }}</span
      >
    </div>
    <span v-if="columns.some((column) => column.marked)" :id="incorrectMarkId" hidden>{{
      t('trainer.incorrect')
    }}</span>
    <StaffCaptions
      v-if="result && layout"
      :question="question"
      :layout="layout"
      :result="result"
      :lang="captionLang"
      @overflow="captionRoom = $event"
    />
  </div>
</template>

<style scoped>
.staff {
  position: relative;
}

.column {
  position: absolute;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  box-sizing: border-box;

  /* Unlike a target over a drawn note, an empty column shows nothing to aim at but its frame. */
  border: var(--line-thin) dashed var(--color-border);
  border-radius: var(--radius-m);
  cursor: pointer;
}

/* At the foot of the column, below the lowest ledger line a note may take, so that it covers no
   note and no line. */
.caption {
  overflow: hidden;
  max-width: 100%;
  font-size: var(--font-size-s);
  white-space: nowrap;
}

.column:focus-visible {
  outline: var(--line-thick) solid var(--color-focus);
  outline-offset: var(--line-medium);
}

/* As the targets of Read notes: the states differ by the frame, not only by colour. The tint is
   multiplied into the drawing under it, so it lies under the lines and notes, not over them. */
.column.current {
  border: var(--line-medium) solid var(--color-accent);
  background: var(--color-accent-tint);
  mix-blend-mode: multiply;
}

.column.marked {
  border: var(--line-medium) dashed var(--color-wrong);
}

.column.marked.current {
  border-width: var(--line-thick);
  box-shadow: inset 0 0 0 var(--line-thick) var(--color-accent);
}
</style>
