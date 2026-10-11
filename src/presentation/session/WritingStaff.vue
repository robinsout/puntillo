<script setup lang="ts">
import { computed, nextTick, shallowRef, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Pitch } from '@/domain/pitch'
import type { Question, WrittenNote } from '@/domain/question'
import { pitchAtStep } from '@/domain/staff'
import { StaffView, stepAt, type StaffLayout } from '@/infrastructure/notation'
import { noteBoxes } from './note-boxes'

export interface NoteColumn {
  // What the column holds for a screen reader: the written note or that there is none.
  readonly valueText: string
  readonly step: number | null
  readonly marked: boolean
}

const props = defineProps<{
  question: Question
  label: string
  // The notes drawn on the staff, one per note of the question, null for none.
  written: readonly (WrittenNote | null)[]
  columns: readonly NoteColumn[]
  current: number
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
  <div ref="staff" class="staff">
    <StaffView
      :question="question"
      :label="label"
      :written="written"
      @load-error="emit('load-error')"
      @drawn="onDrawn"
    />
    <div
      v-for="(box, index) in boxes"
      :key="index"
      role="slider"
      tabindex="0"
      class="column"
      :class="{ current: index === current, marked: columns[index]?.marked }"
      :style="box"
      :aria-label="t('trainer.note', { number: index + 1 })"
      :aria-current="index === current ? 'true' : undefined"
      aria-orientation="vertical"
      :aria-valuenow="columns[index]?.step ?? undefined"
      :aria-valuetext="columns[index]?.valueText"
      :aria-describedby="columns[index]?.marked ? incorrectMarkId : undefined"
      @click="touch($event, index)"
      @keydown="press"
    />
    <span v-if="columns.some((column) => column.marked)" :id="incorrectMarkId" hidden>{{
      t('trainer.incorrect')
    }}</span>
  </div>
</template>

<style scoped>
.staff {
  position: relative;
}

.column {
  position: absolute;
  box-sizing: border-box;
  /* Unlike a target over a drawn note, an empty column shows nothing to aim at but its frame. */
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  cursor: pointer;
}

.column:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

/* As the targets of Read notes: the states differ by the frame, not only by colour. */
.column.current {
  border: 3px solid var(--color-accent);
}

.column.marked {
  border: 2px dashed var(--color-danger);
}

.column.marked.current {
  border-width: 3px;
  box-shadow: inset 0 0 0 3px var(--color-accent);
}
</style>
